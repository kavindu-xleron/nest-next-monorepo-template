import { randomUUID } from "node:crypto"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { Params } from "nestjs-pino"
import { isHealthRoute } from "@shared/http/health-route"

/**
 * pino wiring, kept out of app.module.ts because it is configuration rather
 * than composition. Behaviour is unchanged from the inline version:
 *
 * - an inbound x-request-id is honoured and echoed back on the response, so a
 *   correlation id survives a hop from the web app
 * - authorization, cookie, set-cookie and *.password are redacted
 * - health probes are excluded from access logging, or they drown everything
 * - pino-pretty is dev-only; production emits newline-delimited JSON
 */
export function loggerOptions(configService: ConfigService): Params {
  const isProduction = configService.get<string>("NODE_ENV") === "production"
  const logLevel = configService.get<string>("LOG_LEVEL", "info")

  return {
    pinoHttp: {
      level: logLevel,
      genReqId: (req, res) => {
        const rawHeader = req.headers["x-request-id"]
        const existingId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
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
            options: { colorize: true, singleLine: true },
          },
    },
  }
}

export const loggerModuleOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: loggerOptions,
}
