import { describe, expect, it } from "vitest";

import { presentBarbicanPayload } from "@/lib/openstack/barbican-payload";

describe("presentBarbicanPayload", () => {
  it("shows printable octet-stream payloads as text", () => {
    const payload = new TextEncoder().encode(
      "-----BEGIN PRIVATE KEY-----\nvalue\n",
    );
    expect(presentBarbicanPayload(payload, "application/octet-stream")).toEqual(
      {
        content: "-----BEGIN PRIVATE KEY-----\nvalue\n",
        encoding: "text",
        size: payload.byteLength,
      },
    );
  });

  it("uses base64 for binary payloads", () => {
    expect(
      presentBarbicanPayload(
        new Uint8Array([0, 255, 1]),
        "application/octet-stream",
      ),
    ).toEqual({ content: "AP8B", encoding: "base64", size: 3 });
  });
});
