import { INestApplication } from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"
import request from "supertest"
import { App } from "supertest/types"
import { AppModule } from "../src/app.module"

describe("AppController (e2e)", () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it("/ (GET) should return 200 with x-request-id header", async () => {
    const res = await request(app.getHttpServer()).get("/").expect(200)

    expect(res.text).toBe("Hello World!")
    expect(res.headers["x-request-id"]).toBeDefined()
  })

  it("/ (GET) should echo inbound x-request-id header", async () => {
    const customReqId = "custom-trace-id-999"
    const res = await request(app.getHttpServer())
      .get("/")
      .set("x-request-id", customReqId)
      .expect(200)

    expect(res.headers["x-request-id"]).toBe(customReqId)
  })

  it("/health/live (GET) should return 200 OK", async () => {
    const res = await request(app.getHttpServer())
      .get("/health/live")
      .expect(200)

    expect(res.body.status).toBe("ok")
  })

  it("/health/ready (GET) should return 200 OK when not draining", async () => {
    const res = await request(app.getHttpServer())
      .get("/health/ready")
      .expect(200)

    expect(res.body.status).toBe("ok")
  })

  it("should return RFC 7807 problem+json on 404 error", async () => {
    const res = await request(app.getHttpServer())
      .get("/unknown-route")
      .expect(404)
      .expect("content-type", /application\/problem\+json/)

    expect(res.body).toEqual(
      expect.objectContaining({
        type: "https://httpstatuses.com/404",
        status: 404,
        instance: "/unknown-route",
        requestId: expect.any(String),
      })
    )
  })

  afterAll(async () => {
    await app.close()
  })
})
