import { INestApplication } from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"
import { Logger } from "nestjs-pino"
import request from "supertest"
import { App } from "supertest/types"
import { AppModule } from "../src/app.module"

describe("AppController & User Routes (e2e)", () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useLogger(app.get(Logger))
    app.setGlobalPrefix("api/v1", {
      exclude: ["health/(.*)"],
    })
    await app.init()
  })

  it("/api/v1 (GET) should return 200 with x-request-id header", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/").expect(200)

    expect(res.text).toBe("Hello World!")
    expect(res.headers["x-request-id"]).toBeDefined()
  })

  it("/api/v1 (GET) should echo inbound x-request-id header", async () => {
    const customReqId = "custom-trace-id-999"
    const res = await request(app.getHttpServer())
      .get("/api/v1/")
      .set("x-request-id", customReqId)
      .expect(200)

    expect(res.headers["x-request-id"]).toBe(customReqId)
  })

  it("/health/live (GET) should return 200 OK without route prefix", async () => {
    const res = await request(app.getHttpServer())
      .get("/health/live")
      .expect(200)

    expect(res.body.status).toBe("ok")
  })

  it("/health/ready (GET) should return 200 OK without route prefix", async () => {
    const res = await request(app.getHttpServer())
      .get("/health/ready")
      .expect(200)

    expect(res.body.status).toBe("ok")
  })

  it("should return RFC 7807 problem+json on 404 error", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/unknown-route")
      .expect(404)
      .expect("content-type", /application\/problem\+json/)

    expect(res.body).toEqual(
      expect.objectContaining({
        type: "https://httpstatuses.com/404",
        status: 404,
        instance: "/api/v1/unknown-route",
        requestId: expect.any(String),
      })
    )
  })

  describe("/api/v1/users", () => {
    it("GET /api/v1/users/me should return active user profile", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/users/me")
        .expect(200)

      expect(res.body).toHaveProperty("id")
      expect(res.body).toHaveProperty("email")
      expect(res.body).not.toHaveProperty("clerkId")
      expect(res.body).not.toHaveProperty("deletedAt")
    })

    it("GET /api/v1/users should return paginated response", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/users?limit=5")
        .expect(200)

      expect(res.body).toHaveProperty("items")
      expect(Array.isArray(res.body.items)).toBe(true)
      expect(res.body).toHaveProperty("hasMore")
    })

    it("GET /api/v1/users/:id with invalid ID should return RFC 7807 problem+json 404", async () => {
      const invalidId = "00000000-0000-0000-0000-000000000000"
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${invalidId}`)
        .expect(404)
        .expect("content-type", /application\/problem\+json/)

      expect(res.body.title).toContain("Not Found")
    })
  })

  afterAll(async () => {
    await app.close()
  })
})
