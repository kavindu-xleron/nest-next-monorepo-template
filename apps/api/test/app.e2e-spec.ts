import { ExecutionContext, INestApplication } from "@nestjs/common"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { Test, TestingModule } from "@nestjs/testing"
import { Logger } from "nestjs-pino"
import { ZodValidationPipe } from "nestjs-zod"
import request from "supertest"
import { App } from "supertest/types"
import { AppModule } from "../src/app.module"
import { ClerkAuthGuard } from "../src/core/auth/guards/clerk-auth.guard"

describe("AppController & API Routes (e2e)", () => {
  let app: INestApplication<App>

  const mockUser = {
    id: "019fead6-37f7-7699-809e-87d7e3df2971",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    avatarUrl: null,
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeAll(async () => {
    jest
      .spyOn(ClerkAuthGuard.prototype, "canActivate")
      .mockImplementation(async (context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest()
        req.user = mockUser
        return true
      })

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useLogger(app.get(Logger))
    app.useGlobalPipes(new ZodValidationPipe())
    app.setGlobalPrefix("api/v1", {
      exclude: ["health/(.*)"],
    })

    const swaggerConfig = new DocumentBuilder()
      .setTitle("Next Nest Monorepo API")
      .setVersion("1.0.0")
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup("docs", app, document)

    await app.init()
  })

  it("/health/live (GET) should return 200 OK without route prefix", async () => {
    const res = await request(app.getHttpServer())
      .get("/health/live")
      .expect(200)

    expect(res.body.status).toBe("ok")
  })

  it("/docs (GET) should render OpenAPI documentation without error", async () => {
    const res = await request(app.getHttpServer()).get("/docs").expect(200)
    expect(res.text).toContain("swagger-ui")
  })

  it("/api/v1 (GET) should return 200 with x-request-id header", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/").expect(200)

    expect(res.text).toBe("Hello World!")
    expect(res.headers["x-request-id"]).toBeDefined()
  })

  it("POST /api/v1/users with invalid email should fail validation with 400 Bad Request", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/users")
      .send({ email: "definitely-not-an-email", role: "admin" })
      .expect(400)

    expect(res.body.status).toBe(400)
    expect(res.body.title).toContain("Validation")
  })

  it("GET /api/v1/users/me should return active user profile", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .expect(200)

    expect(res.body).toHaveProperty("id")
    expect(res.body).toHaveProperty("email")
  })

  afterAll(async () => {
    await app.close()
    jest.restoreAllMocks()
  })
})
