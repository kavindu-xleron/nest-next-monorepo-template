import { DynamicModule, Module, ModuleMetadata, Provider } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { BearerAuthGuard } from "./guards/bearer-auth.guard"
import { RolesGuard } from "./guards/roles.guard"

@Module({})
export class AuthModule {
  static register(options: {
    imports?: ModuleMetadata["imports"]
    verifier: Provider
    resolver: Provider
  }): DynamicModule {
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers: [
        options.verifier,
        options.resolver,
        { provide: APP_GUARD, useClass: BearerAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }
  }
}
