# Phase 5 — Webhooks split three ways

**Goal:** stop treating "webhook" as a domain, and close the last core→modules dependency.
**Risk:** medium. Signature verification is security-relevant and awkward to test.
**Prerequisite:** Phase 4 merged.

`clerk-webhook.controller.ts` is 100 lines doing three unrelated things:

| Concern                                                     | Actually is             | Belongs in                    |
| ----------------------------------------------------------- | ----------------------- | ----------------------------- |
| Svix headers, secret, signature verification                | generic infrastructure  | `core/webhooks/svix/`         |
| `email_addresses[]` → primary email, `public_metadata.role` | Clerk payload knowledge | `modules/users/presentation/` |
| find by clerk id, soft-delete                               | a user use case         | `modules/users/application/`  |

The third one is the bug: the controller injects `UsersRepository` and calls
`findByClerkId` + `softDelete` directly, skipping the application layer entirely. It compiles, it
works, and it means user deletion rules now live in two places.

---

## 1. The verification port

- [ ] `core/webhooks/ports/webhook-verifier.ts`:

  ```ts
  export abstract class WebhookVerifier {
    /**
     * Verifies the signature over the RAW body and returns the parsed payload.
     * Throws UnauthorizedException on a bad signature, BadRequestException on
     * missing headers or a missing raw body.
     *
     * Takes Buffer, not string, deliberately: signature schemes sign bytes. The
     * app is bootstrapped with `rawBody: true` in main.ts for exactly this.
     */
    abstract verify<T>(
      rawBody: Buffer | undefined,
      headers: Record<string, string | string[] | undefined>
    ): T
  }
  ```

- [ ] Generic on purpose. Svix signs Clerk _and_ Resend; a Stripe verifier is a sibling adapter with
      the same shape. The controller that consumes it never learns which.

---

## 2. The Svix adapter

- [ ] `core/webhooks/svix/svix-webhook.verifier.ts` — lift the verification half of the controller
      verbatim:

  ```ts
  @Injectable()
  export class SvixWebhookVerifier extends WebhookVerifier {
    constructor(private readonly config: ConfigService) {
      super()
    }

    verify<T>(
      rawBody: Buffer | undefined,
      headers: Record<string, string | string[] | undefined>
    ): T {
      const secret = this.config.get<string>("CLERK_WEBHOOK_SECRET")
      if (!secret) {
        throw new UnauthorizedException(
          "CLERK_WEBHOOK_SECRET is not configured"
        )
      }

      const id = single(headers["svix-id"])
      const timestamp = single(headers["svix-timestamp"])
      const signature = single(headers["svix-signature"])

      if (!id || !timestamp || !signature) {
        throw new BadRequestException("Missing required Svix webhook headers")
      }
      if (!rawBody) {
        throw new BadRequestException(
          "Raw request body is missing for Svix verification"
        )
      }

      try {
        return new Webhook(secret).verify(rawBody.toString("utf8"), {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": signature,
        }) as T
      } catch (err) {
        throw new UnauthorizedException(
          `Invalid Svix webhook signature: ${(err as Error).message}`
        )
      }
    }
  }
  ```

- [ ] The secret name stays `CLERK_WEBHOOK_SECRET` for now — it is already in `env.schema.ts` and in
      every deployment. If a second Svix source appears, generalise then, and remember that a variable
      absent from the schema is invisible to `ConfigService`.
- [ ] Behaviour is unchanged: same exception types, same messages, same order of checks. Do not
      "improve" the error handling while moving it.

---

## 3. `core/webhooks/webhooks.module.ts`

- [ ] Shrinks to providers only — it holds no controllers now:

  ```ts
  @Global()
  @Module({
    providers: [{ provide: WebhookVerifier, useClass: SvixWebhookVerifier }],
    exports: [WebhookVerifier],
  })
  export class WebhooksModule {}
  ```

- [ ] Fold it into `CoreModule`'s imports rather than `AppModule`'s. It is infrastructure, like
      `DatabaseModule`. `AppModule` loses another line.
- [ ] Delete the `-- removed in Phase 5` suppression here.

---

## 4. The controller moves to the domain that owns the data

- [ ] `modules/users/presentation/clerk-user-sync.controller.ts`. It keeps the route
      (`POST /webhooks/clerk`) — **the URL must not change**, it is configured in the Clerk dashboard.
      What changes is which module registers it:

  ```ts
  @ApiTags("webhooks")
  @Controller("webhooks")
  export class ClerkUserSyncController {
    constructor(
      private readonly verifier: WebhookVerifier,
      private readonly users: UsersService
    ) {}

    @Public()
    @Post("clerk")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Handle incoming Clerk webhook user sync events" })
    async handle(@Req() req: RawBodyRequest): Promise<{ success: boolean }> {
      const event = this.verifier.verify<ClerkWebhookEvent>(
        req.rawBody,
        req.headers
      )

      switch (event.type) {
        case "user.created":
        case "user.updated":
          await this.users.ensureJitUser(toJitPayload(event.data))
          break
        case "user.deleted":
          await this.users.removeByExternalId(event.data.id)
          break
      }

      return { success: true }
    }
  }
  ```

- [ ] `toJitPayload` → `modules/users/presentation/clerk-event.mapper.ts`: the
      `email_addresses.find(e => e.id === primary_email_address_id)` lookup, the
      `public_metadata.role` read, and the `first_name` / `last_name` reads. **This is the Clerk
      payload knowledge**, and it is presentation-layer because it maps an external wire format onto
      a use-case input — exactly what a DTO does for an HTTP body.
- [ ] Give `ClerkWebhookEvent` a real type instead of `any`. Even a hand-written narrow interface
      (`{ type: string; data: { id: string; email_addresses?: ...; public_metadata?: ... } }`) beats
      `evt: any`, which currently makes every field access unchecked.
- [ ] Register in `UsersModule`'s `controllers`. Delete `core/webhooks/clerk-webhook.controller.ts`.

### The email fallback

The controller currently falls back to `` `${clerkId}@clerk.dev` `` when no email is present. Phase 4
removed the equivalent fallback on the auth path in favour of failing closed. Be deliberate here — the
two paths differ:

- [ ] **Recommended:** keep a fallback on the webhook path, or return `200` without syncing. Clerk
      retries non-2xx responses with backoff, and a `user.created` event for a user with no email yet
      (some OAuth flows) would otherwise retry forever. Log a warning rather than inventing an
      address, and let the JIT path fill in the email on first sign-in.

---

## 5. The use case that replaces the reach-through

- [ ] `UsersService.removeByExternalId` was added in Phase 3 §3.4 precisely so this phase does not
      have to introduce logic:

  ```ts
  async removeByExternalId(externalId: string): Promise<void> {
    const existing = await this.usersRepository.findByExternalId(externalId)
    if (!existing) return          // already gone; webhooks are at-least-once
    await this.usersRepository.softDelete(existing.id)
  }
  ```

- [ ] The controller no longer injects `UsersRepository`. That is the layer violation closed.
- [ ] Idempotence matters here: Svix delivers at least once, so a duplicate `user.deleted` must be a
      no-op `200`, not a `404`.

---

## 6. Tests

- [ ] `svix-webhook.verifier.spec.ts` — missing secret → `401`; each missing header → `400`; missing
      raw body → `400`; tampered body → `401`; valid signature → parsed payload. Generate fixtures
      with `svix`'s own `Webhook.sign` rather than hardcoding a signature, or the test rots the next
      time the library updates.
- [ ] `clerk-event.mapper.spec.ts` — primary email selected by `primary_email_address_id`; falls back
      to `email_addresses[0]`; missing `public_metadata.role` → `"user"`. Pure functions.
- [ ] `clerk-user-sync.controller.spec.ts` — `user.created` and `user.updated` call `ensureJitUser`;
      `user.deleted` calls `removeByExternalId`; an unknown event type returns `200` and touches
      nothing.
- [ ] `users.service.spec.ts` — `removeByExternalId` soft-deletes when found, is a silent no-op when
      not.
- [ ] Delete `core/webhooks/clerk-webhook.controller.spec.ts` once the three above cover it.
- [ ] Delete the four remaining `-- removed in Phase 5` suppressions.

---

## 7. Verify

- [ ] `pnpm --filter api lint typecheck test test:e2e` → green.
- [ ] `grep -rn "removed in Phase" apps/api/src` → **no matches**. All eight Phase 1 suppressions are
      gone; the boundary rules now hold with no exemptions.
- [ ] `grep -rn "@modules" apps/api/src/core` → no matches.
- [ ] `grep -rn "svix" apps/api/src` → matches only in `core/webhooks/svix/`.
- [ ] `grep -rn "UsersRepository" apps/api/src/modules/users/presentation` → no matches. Controllers
      talk to the application layer.
- [ ] **Live replay.** Boot locally, expose with a tunnel, and send a real Clerk event — or replay a
      captured payload with a valid signature:
  - `user.created` → row appears.
  - `user.updated` with a changed name → row updates.
  - `user.deleted` → `deleted_at` set; the same event again returns `200` and changes nothing.
  - Tamper one byte of the body → `401`, and no row changes.
- [ ] `GET /docs` still lists the webhook route under the `webhooks` tag — it moved modules, not URLs.

## Rollback

One commit. The route path, the secret name, and the response shape are all unchanged, so Clerk's
dashboard configuration is unaffected either way.

## Definition of done

- Signature verification is a reusable adapter behind a port.
- Clerk payload mapping lives with the users module and is unit-tested as a pure function.
- No controller anywhere injects a repository.
- Zero lint suppressions remain from the migration.
