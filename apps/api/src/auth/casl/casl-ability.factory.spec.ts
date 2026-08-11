import { Action, CaslAbilityFactory, UserSubject } from "./casl-ability.factory"

describe("CaslAbilityFactory", () => {
  let factory: CaslAbilityFactory

  beforeEach(() => {
    factory = new CaslAbilityFactory()
  })

  it("should grant admin full management ability", () => {
    const ability = factory.createForUser({ id: "admin-1", role: "admin" })

    expect(ability.can(Action.Manage, "all")).toBe(true)
    expect(ability.can(Action.Delete, UserSubject)).toBe(true)
  })

  it("should restrict regular user to reading and updating own profile", () => {
    const ability = factory.createForUser({ id: "user-1", role: "user" })
    const ownProfile = Object.assign(new UserSubject(), { id: "user-1" })
    const otherProfile = Object.assign(new UserSubject(), { id: "user-2" })

    expect(ability.can(Action.Manage, "all")).toBe(false)
    expect(ability.can(Action.Read, ownProfile)).toBe(true)
    expect(ability.can(Action.Update, ownProfile)).toBe(true)
    expect(ability.can(Action.Read, otherProfile)).toBe(false)
    expect(ability.can(Action.Update, otherProfile)).toBe(false)
    expect(ability.can(Action.Delete, ownProfile)).toBe(false)
  })
})
