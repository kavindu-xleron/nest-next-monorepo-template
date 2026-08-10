import { randomUUID } from "node:crypto"
import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { APP_FILTER } from "@nestjs/core"
import { LoggerModule } from "nestjs-pino"
import { AppController } from "./app.controller"
import { AppService } from "./app.service"
import { ProblemDetailsFilter } from "./common/filters/problem-details.filter"
import { isHealthRoute } from "./common/http/health-route"
import { validateEnv } from "./config/env.schema"
import { HealthModule } from "./health/health.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>("NODE_ENV") === "production"
        const logLevel = configService.get<string>("LOG_LEVEL", "info")

        return {
          pinoHttp: {
            level: logLevel,
            genReqId: (req, res) => {
              const rawHeader = req.headers["x-request-id"]
              const existingId = Array.isArray(rawHeader)
                ? rawHeader[0]
                : rawHeader
              const reqId = existingId || randomUUID()
              res.setHeader("x-request-id", reqId)
              return reqId
            },
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              'res.headers["set-cookie"]',
              "*.password",
            ],
            autoLogging: {
              ignore: (req) => isHealthRoute(req.url),
            },
            transport: isProduction
              ? undefined
              : {
                  target: "pino-pretty",
                  options: {
                    colorize: true,
                    singleLine: true,
                  },
                },
          },
        }
      },
    }),
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class AppModule {}
