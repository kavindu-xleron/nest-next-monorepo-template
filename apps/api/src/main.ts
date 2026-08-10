import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { Logger } from "nestjs-pino"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))

  const configService = app.get(ConfigService)
  const port = configService.get<number>("PORT", 5001)

  await app.listen(port)
}
bootstrap()
