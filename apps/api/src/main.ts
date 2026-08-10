import { Server } from "node:http"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { Logger } from "nestjs-pino"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  app.enableShutdownHooks()

  const server = app.getHttpServer() as Server
  server.keepAliveTimeout = 65000
  server.headersTimeout = 66000

  const configService = app.get(ConfigService)
  const port = configService.get<number>("PORT", 5001)

  await app.listen(port)
}
bootstrap()
