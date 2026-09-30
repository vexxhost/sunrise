import { describe, expect, it } from "vitest";

import {
  createContainerSchema,
  createOrderSchema,
  createSecretSchema,
} from "./barbican-input";

const secretRef =
  "https://barbican.example/v1/secrets/11111111-1111-4111-8111-111111111111";

describe("Barbican mutation inputs", () => {
  it("accepts an empty payload for metadata-only secret creation", () => {
    expect(
      createSecretSchema.safeParse({
        name: "metadata-only",
        secretType: "opaque",
        payload: "",
        payloadEncoding: "plain",
        contentType: "text/plain",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed base64 payloads", () => {
    const result = createSecretSchema.safeParse({
      name: "encoded",
      secretType: "opaque",
      payload: "not base64!",
      payloadEncoding: "base64",
      contentType: "application/octet-stream",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Payload must be valid base64.",
      );
    }
  });

  it("enforces the payload limit in bytes, not JavaScript characters", () => {
    const result = createSecretSchema.safeParse({
      name: "unicode-payload",
      secretType: "opaque",
      payload: "é".repeat(50_001),
      payloadEncoding: "plain",
      contentType: "text/plain",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("100,000 bytes");
    }
  });

  it("enforces required RSA container roles", () => {
    const result = createContainerSchema.safeParse({
      name: "key pair",
      type: "rsa",
      secretRefs: [{ name: "public_key", secretRef }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(({ message }) =>
          message.includes("private_key"),
        ),
      ).toBe(true);
    }
  });

  it("rejects duplicate secret references", () => {
    const result = createContainerSchema.safeParse({
      name: "bundle",
      type: "generic",
      secretRefs: [
        { name: "first", secretRef },
        { name: "second", secretRef },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Each secret can be referenced only once.",
      );
    }
  });

  it("rejects URLs that are not Barbican secret references", () => {
    const result = createContainerSchema.safeParse({
      name: "bundle",
      type: "generic",
      secretRefs: [
        {
          name: "payload",
          secretRef:
            "https://barbican.example/v1/containers/11111111-1111-4111-8111-111111111111",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("validates key generation input", () => {
    expect(
      createOrderSchema.safeParse({
        type: "key",
        name: "database-key",
        algorithm: "aes",
        bitLength: 256,
        mode: "cbc",
      }).success,
    ).toBe(true);
    expect(
      createOrderSchema.safeParse({
        type: "key",
        name: "database-key",
        algorithm: "aes",
        bitLength: 0,
      }).success,
    ).toBe(false);
  });
});
