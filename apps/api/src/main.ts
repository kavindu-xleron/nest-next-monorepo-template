import { Server } from "node:http"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { Logger } from "nestjs-pino"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
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

  const configService = app.get(ConfigService)
  const port = configService.get<number>("PORT", 5001)

  await app.listen(port)
}
bootstrap()
