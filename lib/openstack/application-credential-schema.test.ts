import { describe, expect, it } from "vitest";
import {
  parseAccessRulesJson,
  parseApplicationCredentialList,
  parseCreateApplicationCredentialInput,
  parseCreatedApplicationCredential,
} from "@/lib/openstack/application-credential-schema";

describe("application credential schemas", () => {
  it("validates access-rule definitions and normalizes HTTP methods", () => {
    expect(
      parseAccessRulesJson(
        JSON.stringify([
          { service: "compute", method: "get", path: "/v2.1/servers/**" },
          { id: "existing-rule" },
        ]),
      ),
    ).toEqual({
      ok: true,
      value: [
        { service: "compute", method: "GET", path: "/v2.1/servers/**" },
        { id: "existing-rule" },
      ],
      errors: [],
    });
  });

  it("rejects invalid JSON and API paths without a leading slash", () => {
    expect(parseAccessRulesJson("not json")).toMatchObject({ ok: false });
    expect(
      parseAccessRulesJson(
        JSON.stringify([
          { service: "compute", method: "GET", path: "v2.1/servers" },
        ]),
      ),
    ).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("Path must start with /")],
    });
  });

  it("validates create input and preserves an omitted role selection", () => {
    const result = parseCreateApplicationCredentialInput({
      name: "ci-deployer",
      accessRules: [],
      unrestricted: false,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roleIds).toBeUndefined();
    expect(
      parseCreateApplicationCredentialInput({ name: "", accessRules: [] })
        .success,
    ).toBe(false);
  });

  it("parses list responses and requires the one-time create secret", () => {
    const credential = {
      id: "credential-id",
      name: "ci-deployer",
      project_id: "project-a",
      unrestricted: false,
      roles: [{ id: "reader-id", name: "reader" }],
      access_rules: [],
    };

    expect(
      parseApplicationCredentialList({ application_credentials: [credential] }),
    ).toEqual([
      expect.objectContaining({
        ...credential,
        description: null,
        expires_at: null,
      }),
    ]);
    expect(() =>
      parseCreatedApplicationCredential({ application_credential: credential }),
    ).toThrow();
    expect(
      parseCreatedApplicationCredential({
        application_credential: { ...credential, secret: "one-time-secret" },
      }).secret,
    ).toBe("one-time-secret");
  });
});
