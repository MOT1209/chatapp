import { describe, expect, it } from "vitest";

import {
  displayNameSchema,
  emailSchema,
  forgotPasswordSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  usernameSchema,
} from "./schemas";

/**
 * These rules are duplicated in docs/api-contract.md §3.1. The test comment on each
 * case names the clause it enforces, so a contract change shows up here as a failure
 * rather than as a silent divergence.
 */
describe("usernameSchema", () => {
  it("accepts 3-30 lowercase letters, digits, dot and underscore", () => {
    expect(usernameSchema.safeParse("ahmad").success).toBe(true);
    expect(usernameSchema.safeParse("ahmad_1.2").success).toBe(true);
    expect(usernameSchema.safeParse("a".repeat(30)).success).toBe(true);
  });

  it("rejects anything shorter than 3 characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects anything longer than 30 characters", () => {
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects uppercase, spaces and non-ASCII letters", () => {
    expect(usernameSchema.safeParse("Ahmad").success).toBe(false);
    expect(usernameSchema.safeParse("ahmad ali").success).toBe(false);
    expect(usernameSchema.safeParse("أحمد").success).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(usernameSchema.parse("  ahmad  ")).toBe("ahmad");
  });
});

describe("emailSchema", () => {
  it("accepts a normal address and lowercases it", () => {
    expect(emailSchema.parse("Ahmad@Example.COM")).toBe("ahmad@example.com");
  });

  it("rejects a malformed address", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("missing@tld").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("rejects fewer than 8 characters", () => {
    expect(passwordSchema.safeParse("short12").success).toBe(false);
  });

  it("rejects more than 72 characters, which bcrypt would silently truncate", () => {
    expect(passwordSchema.safeParse("a".repeat(73)).success).toBe(false);
  });

  it("accepts exactly 72", () => {
    expect(passwordSchema.safeParse("a".repeat(72)).success).toBe(true);
  });
});

describe("displayNameSchema", () => {
  it("accepts Arabic and Latin text", () => {
    expect(displayNameSchema.safeParse("أحمد").success).toBe(true);
    expect(displayNameSchema.safeParse("Ahmad H").success).toBe(true);
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(displayNameSchema.safeParse("").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects more than 50 characters", () => {
    expect(displayNameSchema.safeParse("a".repeat(51)).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts either a username or an email in one field", () => {
    expect(loginSchema.safeParse({ identifier: "ahmad", password: "password123" }).success).toBe(true);
    expect(
      loginSchema.safeParse({ identifier: "ahmad@example.com", password: "password123" }).success,
    ).toBe(true);
  });

  it("requires both fields", () => {
    expect(loginSchema.safeParse({ identifier: "", password: "" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = {
    displayName: "أحمد",
    username: "ahmad",
    email: "ahmad@example.com",
    password: "password123",
    confirmPassword: "password123",
  };

  it("accepts a consistent form", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched passwords and blames the confirmation field", () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: "different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });

  it("rejects a username that breaks the character rules", () => {
    expect(registerSchema.safeParse({ ...valid, username: "Ahmad" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("validates the email only", () => {
    expect(forgotPasswordSchema.safeParse({ email: "ahmad@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});
