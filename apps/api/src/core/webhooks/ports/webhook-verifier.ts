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
