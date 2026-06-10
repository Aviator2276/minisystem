import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "./password"

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword("hunter2")
    expect(verifyPassword("hunter2", stored)).toBe(true)
  })

  it("rejects a wrong password", () => {
    const stored = hashPassword("hunter2")
    expect(verifyPassword("hunter3", stored)).toBe(false)
  })

  it("salts hashes so equal passwords differ", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"))
  })

  it("rejects malformed stored values", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false)
    expect(verifyPassword("x", "")).toBe(false)
  })
})
