import { Server } from "node:http"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import helmet from "helmet"
import { Logger } from "nestjs-pino"
import { ZodValidationPipe, patchNestJsSwagger } from "nestjs-zod"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  })
  app.useLogger(app.get(Logger))

  const configService = app.get(ConfigService)

  // Security HTTP headers
  app.use(helmet())

  // CORS configuration
  const corsOrigin = configService.get<string>("CORS_ORIGIN", "*")
  app.enableCors({
    origin: corsOrigin === "*" ? true : corsOrigin.split(","),
    credentials: true,
  })

  // Global API route prefix (excluding health check probes)
  app.setGlobalPrefix("api/v1", {
    exclude: ["health/(.*)"],
  })

  // Global Zod validation pipe
  app.useGlobalPipes(new ZodValidationPipe())

  // Patch Swagger to understand Zod schemas
  patchNestJsSwagger()

  // Swagger OpenAPI configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Next Nest Monorepo API")
    .setDescription("Production-grade NestJS REST API with Drizzle ORM")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup("docs", app, document)

  // `[]` keeps Nest's default signal set. `useProcessExit` is what matters:
  // by default Nest finishes its hooks and then re-raises the signal via
  // process.kill(), which terminates the process immediately and discards
  // whatever pino still holds in its transport worker — in practice the whole
  // tail of the shutdown sequence, exactly the part you need when a deploy
  // misbehaves. Exiting instead fires the 'exit' event that pino flushes on.
  // The cost is reporting exit 0 rather than 143; both read as a clean stop.
  app.enableShutdownHooks([], { useProcessExit: true })

  const server = app.getHttpServer() as Server
  server.keepAliveTimeout = 65000
  server.headersTimeout = 66000

  const port = configService.get<number>("PORT", 5001)

  await app.listen(port)
}
bootstrap()
