import {
  AbilityBuilder,
  createMongoAbility,
  ExtractSubjectType,
  InferSubjects,
  MongoAbility,
} from "@casl/ability"
import { Injectable } from "@nestjs/common"

export enum Action {
  Manage = "manage",
  Create = "create",
  Read = "read",
  Update = "update",
  Delete = "delete",
}

export class UserSubject {
  id!: string
}

export type Subjects = InferSubjects<typeof UserSubject> | "User" | "all"

export type AppAbility = MongoAbility<[Action, Subjects]>

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: { id: string; role: string }): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    if (user.role === "admin") {
      can(Action.Manage, "all")
    } else {
      can(Action.Read, UserSubject, { id: user.id })
      can(Action.Update, UserSubject, { id: user.id })
    }

    return build({
      detectSubjectType: (item) =>
        item.constructor as ExtractSubjectType<Subjects>,
    })
  }
}
