import { describe, expect, it } from "vitest";

import {
  barbicanIdFromRef,
  parseBarbicanContainer,
  parseBarbicanOrder,
  parseBarbicanQuotas,
  parseBarbicanSecret,
  parseBarbicanTransportKeys,
} from "./barbican-schema";

describe("Barbican response parsing", () => {
  it("extracts resource IDs from absolute references", () => {
    expect(
      barbicanIdFromRef(
        "https://barbican.example/v1/secrets/11111111-1111-4111-8111-111111111111",
        "secret",
      ),
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(() =>
      barbicanIdFromRef("https://barbican.example/v1/secrets/", "secret"),
    ).toThrow("Barbican returned an invalid secret reference.");
    expect(() => barbicanIdFromRef("", "secret")).toThrow(
      "Barbican returned an invalid secret reference.",
    );
  });

  it("normalizes optional secret fields", () => {
    expect(
      parseBarbicanSecret({
        secret_ref:
          "https://barbican.example/v1/secrets/11111111-1111-4111-8111-111111111111",
        content_types: { default: "text/plain" },
      }),
    ).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      name: null,
      status: "UNKNOWN",
      secret_type: "opaque",
      algorithm: null,
      content_types: { default: "text/plain" },
    });
  });

  it("normalizes nested container references", () => {
    expect(
      parseBarbicanContainer({
        container_ref:
          "https://barbican.example/v1/containers/22222222-2222-4222-8222-222222222222",
        type: "generic",
        secret_refs: [
          {
            name: "payload",
            secret_ref:
              "https://barbican.example/v1/secrets/11111111-1111-4111-8111-111111111111",
          },
        ],
      }).secret_refs[0],
    ).toMatchObject({
      name: "payload",
      secret_id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("normalizes generated order references", () => {
    expect(
      parseBarbicanOrder({
        order_ref:
          "https://barbican.example/v1/orders/33333333-3333-4333-8333-333333333333",
        type: "key",
        secret_ref:
          "https://barbican.example/v1/secrets/11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      secret_ref:
        "https://barbican.example/v1/secrets/11111111-1111-4111-8111-111111111111",
      container_ref: null,
    });
  });

  it("parses all standard quota limits, including unlimited values", () => {
    expect(
      parseBarbicanQuotas({
        quotas: {
          secrets: -1,
          containers: 10,
          orders: 20,
          consumers: -1,
          cas: 0,
        },
      }),
    ).toEqual({
      secrets: -1,
      containers: 10,
      orders: 20,
      consumers: -1,
      cas: 0,
    });
  });

  it("normalizes transport-key references", () => {
    expect(
      parseBarbicanTransportKeys({
        transport_keys: [
          "https://barbican.example/v1/transport_keys/44444444-4444-4444-8444-444444444444",
        ],
        total: 1,
      }),
    ).toEqual({
      items: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          transport_key_ref:
            "https://barbican.example/v1/transport_keys/44444444-4444-4444-8444-444444444444",
        },
      ],
      total: 1,
    });
  });
});
