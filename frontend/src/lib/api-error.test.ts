import { describe, expect, it } from "vitest";

import { ApiError, NetworkError } from "@/lib/api-client";
import { isRetryableError, toErrorMessage } from "@/lib/api-error";

describe("isRetryableError", () => {
  it("retries a network failure, which usually clears on its own", () => {
    expect(isRetryableError(new NetworkError("offline"))).toBe(true);
  });

  it("retries a 500", () => {
    expect(isRetryableError(new ApiError({ code: "SERVER_ERROR", message: "boom" }, 500))).toBe(
      true,
    );
  });

  it("retries a 429, because rate limits reset", () => {
    expect(isRetryableError(new ApiError({ code: "RATE_LIMITED", message: "slow down" }, 429))).toBe(
      true,
    );
  });

  it("does not retry a rejected password, which would fail again identically", () => {
    expect(
      isRetryableError(new ApiError({ code: "INVALID_CREDENTIALS", message: "wrong" }, 401)),
    ).toBe(false);
  });

  it("does not retry a 404, which will still be a 404", () => {
    expect(isRetryableError(new ApiError({ code: "NOT_FOUND", message: "gone" }, 404))).toBe(false);
  });

  it("does not retry a validation error", () => {
    expect(
      isRetryableError(
        new ApiError({ code: "VALIDATION_ERROR", message: "bad input" }, 400),
      ),
    ).toBe(false);
  });
});

describe("toErrorMessage", () => {
  it("returns the backend's own message rather than replacing it", () => {
    // Swallowing this would hide a real server bug from the user.
    expect(toErrorMessage(new ApiError({ code: "SERVER_ERROR", message: "Database offline" }, 500))).toBe(
      "Database offline",
    );
  });

  it("falls back when the value is not an Error", () => {
    expect(toErrorMessage("something", "fallback")).toBe("fallback");
  });

  it("falls back for null", () => {
    expect(toErrorMessage(null, "fallback")).toBe("fallback");
  });
});

describe("ApiError", () => {
  it("keeps the field map for validation failures", () => {
    const error = new ApiError(
      { code: "VALIDATION_ERROR", message: "bad", fields: { username: "taken" } },
      400,
    );
    expect(error.fields).toEqual({ username: "taken" });
  });

  it("is a real Error, so it survives a generic catch", () => {
    const error = new ApiError({ code: "SERVER_ERROR", message: "boom" }, 500);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.status).toBe(500);
  });
});
