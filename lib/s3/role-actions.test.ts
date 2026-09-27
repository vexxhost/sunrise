import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  GetRoleCommand,
  GetRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolesCommand,
  ListRolePoliciesCommand,
  ListRoleTagsCommand,
  PutRolePolicyCommand,
  TagRoleCommand,
  UntagRoleCommand,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveRoleIamContext: vi.fn(),
  guardMutationContext: vi.fn(),
  roleNameFromArn: vi.fn((arn: string) => arn.split("/").at(-1)),
}));

vi.mock("@/lib/mutation-context", () => ({
  guardMutationContext: mocks.guardMutationContext,
}));

vi.mock("@/lib/s3/iam", () => ({
  getActiveRoleIamContext: mocks.getActiveRoleIamContext,
}));

vi.mock("@/lib/s3/arn", () => ({
  roleNameFromArn: mocks.roleNameFromArn,
}));

vi.mock("@/lib/s3/client", () => ({
  S3AuthRequiredError: class S3AuthRequiredError extends Error {},
}));

import { S3AuthRequiredError } from "@/lib/s3/client";
import {
  attachIamManagedRolePolicy,
  createIamRole,
  deleteIamRole,
  getAccessRoleDetails,
  getRoleDetails,
  listRoles,
  listRolesForRender,
  putIamInlineRolePolicy,
  updateIamRoleTags,
  updateIamRoleTrustPolicy,
} from "@/lib/s3/role-actions";

const activeRoleArn =
  "arn:aws:iam::RGW08738775184976726:role/service-roles/AssumeRoleSunriseReadWrite";

function createClient() {
  return {
    send: vi.fn(),
    destroy: vi.fn(),
  };
}

function accessDeniedError() {
  return Object.assign(new Error("UnknownError"), {
    name: "AccessDenied",
    Code: "AccessDenied",
    $metadata: { requestId: "tx-request-id", httpStatusCode: 403 },
    $response: {
      headers: { server: "Ceph Object Gateway (tentacle)" },
    },
  });
}

function unknownHttp403Error() {
  return Object.assign(new Error("UnknownError"), {
    name: "UnknownError",
    $metadata: { requestId: "tx-unknown-403", httpStatusCode: 403 },
    $response: {
      headers: { server: "Ceph Object Gateway (tentacle)" },
    },
  });
}

describe("IAM role actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardMutationContext.mockResolvedValue({
      ok: true,
      context: {
        scope: { projectId: "project-a", regionId: "RegionOne" },
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("paginates and maps the roles visible to the active project", async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (!(command instanceof ListRolesCommand)) {
        throw new Error("Unexpected IAM command");
      }
      if (!command.input.Marker) {
        return Promise.resolve({
          Roles: [
            {
              RoleName: "FirstRole",
              Arn: "arn:aws:iam::RGW1:role/FirstRole",
              Path: "/service-roles/",
              RoleId: "role-1",
              Description: "First role",
              CreateDate: new Date("2026-05-29T12:00:00Z"),
              MaxSessionDuration: 3600,
            },
            { RoleName: "IncompleteRole" },
          ],
          IsTruncated: true,
          Marker: "next-page",
        });
      }
      return Promise.resolve({
        Roles: [
          {
            RoleName: "SecondRole",
            Arn: "arn:aws:iam::RGW1:role/SecondRole",
          },
        ],
        IsTruncated: false,
      });
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await listRoles();

    expect(result).toEqual({
      ok: true,
      accessDenied: false,
      roles: [
        {
          name: "FirstRole",
          arn: "arn:aws:iam::RGW1:role/FirstRole",
          path: "/service-roles/",
          id: "role-1",
          description: "First role",
          createdAt: "2026-05-29T12:00:00.000Z",
          maxSessionDuration: 3600,
          isActive: false,
        },
        {
          name: "SecondRole",
          arn: "arn:aws:iam::RGW1:role/SecondRole",
          path: "/",
          id: null,
          description: null,
          createdAt: null,
          maxSessionDuration: null,
          isActive: false,
        },
      ],
      activeRoleArn,
    });
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(mocks.getActiveRoleIamContext).toHaveBeenCalledWith({
      allowCredentialRefresh: true,
    });
  });

  it("does not refresh credentials during server rendering", async () => {
    const client = createClient();
    client.send.mockResolvedValue({ Roles: [], IsTruncated: false });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    await listRolesForRender();

    expect(mocks.getActiveRoleIamContext).toHaveBeenCalledWith({
      allowCredentialRefresh: false,
    });
  });

  it("turns ListRoles AccessDenied into a restricted empty result", async () => {
    const client = createClient();
    client.send.mockRejectedValue(accessDeniedError());
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await listRoles();

    expect(result).toEqual({
      ok: true,
      roles: [],
      activeRoleArn,
      accessDenied: true,
      denialRequestId: "tx-request-id",
    });
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("recognizes an unmodeled HTTP 403 as restricted access", async () => {
    const client = createClient();
    client.send.mockRejectedValue(unknownHttp403Error());
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await listRoles();

    expect(result).toEqual({
      ok: true,
      roles: [],
      activeRoleArn,
      accessDenied: true,
      denialRequestId: "tx-unknown-403",
    });
  });

  it("recognizes AccessDeniedException without relying on HTTP status", async () => {
    const client = createClient();
    client.send.mockRejectedValue(
      Object.assign(new Error("Forbidden"), {
        name: "AccessDeniedException",
        $metadata: { requestId: "tx-access-denied-exception" },
      }),
    );
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await listRoles();

    expect(result).toEqual({
      ok: true,
      roles: [],
      activeRoleArn,
      accessDenied: true,
      denialRequestId: "tx-access-denied-exception",
    });
  });

  it("returns complete active-role metadata and policy documents", async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: {
            RoleName: "AssumeRoleSunriseReadWrite",
            Arn: activeRoleArn,
            Path: "/service-roles/",
            RoleId: "role-id",
            Description: "Sunrise access role",
            CreateDate: new Date("2026-05-29T12:00:00Z"),
            MaxSessionDuration: 3600,
            Tags: [
              { Key: "project-access", Value: "project:readwrite" },
              { Key: "presence-only", Value: "" },
              { Key: "ignored-without-value" },
            ],
            AssumeRolePolicyDocument: encodeURIComponent(
              JSON.stringify({ Version: "2012-10-17", Statement: [] }),
            ),
          },
        });
      }
      if (command instanceof ListRoleTagsCommand) {
        return Promise.resolve({
          Tags: [
            { Key: "project-access", Value: "project:readwrite" },
            { Key: "project-access", Value: "project:readwrite" },
            { Key: "presence-only", Value: "" },
            { Key: "ignored-without-value" },
          ],
          IsTruncated: false,
        });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({
          PolicyNames: ["S3Access"],
          IsTruncated: false,
        });
      }
      if (command instanceof GetRolePolicyCommand) {
        return Promise.resolve({
          PolicyDocument: encodeURIComponent(
            JSON.stringify({ Statement: [{ Action: "s3:*" }] }),
          ),
        });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({
          AttachedPolicies: [
            {
              PolicyName: "ManagedReadOnly",
              PolicyArn: "arn:aws:iam::RGW1:policy/ManagedReadOnly",
            },
            { PolicyName: "IncompletePolicy" },
          ],
          IsTruncated: false,
        });
      }
      throw new Error("Unexpected IAM command");
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await getAccessRoleDetails();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected role details");
    expect(result).toMatchObject({
      roleName: "AssumeRoleSunriseReadWrite",
      roleArn: activeRoleArn,
      path: "/service-roles/",
      id: "role-id",
      description: "Sunrise access role",
      createdAt: "2026-05-29T12:00:00.000Z",
      maxSessionDuration: 3600,
      tagsAvailable: true,
      tags: [
        { key: "project-access", value: "project:readwrite" },
        { key: "presence-only", value: "" },
      ],
      inlinePoliciesAvailable: true,
      attachedPoliciesAvailable: true,
      attachedPolicies: [
        {
          name: "ManagedReadOnly",
          arn: "arn:aws:iam::RGW1:policy/ManagedReadOnly",
        },
      ],
      warnings: [],
      isActiveRole: true,
    });
    expect(JSON.parse(result.assumeRolePolicy ?? "{}")).toEqual({
      Version: "2012-10-17",
      Statement: [],
    });
    expect(result.inlinePolicies).toHaveLength(1);
    expect(JSON.parse(result.inlinePolicies[0].document ?? "{}")).toEqual({
      Statement: [{ Action: "s3:*" }],
    });
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("preserves literal plus characters in raw policy JSON", async () => {
    const client = createClient();
    const rawPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Condition: {
            StringEquals: { "aws:RequestTag/example": "team+platform" },
          },
        },
      ],
    };
    client.send.mockImplementation((command) => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: {
            Arn: activeRoleArn,
            AssumeRolePolicyDocument: JSON.stringify(rawPolicy),
          },
        });
      }
      if (command instanceof ListRoleTagsCommand) {
        return Promise.resolve({ Tags: [], IsTruncated: false });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({ PolicyNames: [], IsTruncated: false });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({
          AttachedPolicies: [],
          IsTruncated: false,
        });
      }
      throw new Error("Unexpected IAM command");
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await getAccessRoleDetails();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected role details");
    expect(JSON.parse(result.assumeRolePolicy ?? "{}")).toEqual(rawPolicy);
  });

  it("keeps partial role details and replaces Ceph diagnostics with friendly permission warnings", async () => {
    const client = createClient();
    client.send.mockRejectedValue(accessDeniedError());
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await getAccessRoleDetails();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected partial role details");
    expect(result.roleArn).toBe(activeRoleArn);
    expect(result.inlinePoliciesAvailable).toBe(false);
    expect(result.attachedPoliciesAvailable).toBe(false);
    expect(result.warnings).toEqual([
      "You do not have permission to view the assume role policy.",
      "You do not have permission to view role tags.",
      "You do not have permission to view inline role policies.",
      "You do not have permission to view attached role policies.",
    ]);
    expect(result.warnings.join(" ")).not.toMatch(
      /UnknownError|tx-request-id|Ceph Object Gateway/,
    );
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("uses a friendly error when one inline policy document is denied", async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({ Role: { Arn: activeRoleArn } });
      }
      if (command instanceof ListRoleTagsCommand) {
        return Promise.resolve({ Tags: [], IsTruncated: false });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({
          PolicyNames: ["RestrictedPolicy"],
          IsTruncated: false,
        });
      }
      if (command instanceof GetRolePolicyCommand) {
        return Promise.reject(accessDeniedError());
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({
          AttachedPolicies: [],
          IsTruncated: false,
        });
      }
      throw new Error("Unexpected IAM command");
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await getAccessRoleDetails();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected role details");
    expect(result.inlinePolicies).toEqual([
      {
        name: "RestrictedPolicy",
        document: null,
        error: "You do not have permission to view this policy document.",
      },
    ]);
  });

  it("uses the ARN selected from the roles list for role details", async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (command instanceof GetRoleCommand) {
        expect(command.input.RoleName).toBe("ListedRole");
        return Promise.resolve({ Role: {} });
      }
      if (command instanceof ListRoleTagsCommand) {
        return Promise.resolve({ Tags: [], IsTruncated: false });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({ PolicyNames: [], IsTruncated: false });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({ AttachedPolicies: [], IsTruncated: false });
      }
      throw new Error("Unexpected IAM command");
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });
    const listedRoleArn = "arn:aws:iam::RGW1:role/team/ListedRole";
    mocks.roleNameFromArn.mockReturnValueOnce("ListedRole");

    const result = await getRoleDetails("ListedRole", listedRoleArn);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected role details");
    expect(result.roleName).toBe("ListedRole");
    expect(result.roleArn).toBe(listedRoleArn);
  });

  it("creates a role with a validated compact trust policy", async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      expect(command).toBeInstanceOf(CreateRoleCommand);
      expect(command.input).toMatchObject({
        RoleName: "SunriseTestRole",
        Path: "/sunrise-test/",
        Description: "Disposable test role",
        MaxSessionDuration: 3600,
        Tags: [{ Key: "owner", Value: "sunrise" }],
      });
      expect(
        JSON.parse(command.input.AssumeRolePolicyDocument ?? "{}"),
      ).toEqual({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: activeRoleArn },
            Action: "sts:AssumeRole",
          },
        ],
      });
      return Promise.resolve({
        Role: { Arn: "arn:aws:iam::RGW1:role/sunrise-test/SunriseTestRole" },
      });
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await createIamRole(
      { projectId: "project-a", regionId: "RegionOne" },
      {
        name: "SunriseTestRole",
        path: "/sunrise-test/",
        description: "Disposable test role",
        maxSessionDuration: 3600,
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: activeRoleArn },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        tags: [{ key: "owner", value: "sunrise" }],
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        roleName: "SunriseTestRole",
        roleArn: "arn:aws:iam::RGW1:role/sunrise-test/SunriseTestRole",
      },
    });
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("reconciles edited, removed, and added role tags as a map", async () => {
    const client = createClient();
    let listRequest = 0;
    const removedTagKeys: string[] = [];
    client.send.mockImplementation((command) => {
      if (command instanceof ListRoleTagsCommand) {
        listRequest += 1;
        return Promise.resolve({
          Tags:
            listRequest === 1
              ? [
                  { Key: "owner", Value: "old-team" },
                  { Key: "environment", Value: "development" },
                  { Key: "scope", Value: "objects" },
                  { Key: "unchanged", Value: "yes" },
                ]
              : [
                  { Key: "owner", Value: "platform" },
                  { Key: "scope", Value: "metadata" },
                  { Key: "unchanged", Value: "yes" },
                  { Key: "cost-center", Value: "1234" },
                ],
          IsTruncated: false,
        });
      }
      if (command instanceof UntagRoleCommand) {
        expect(command.input).toMatchObject({
          RoleName: "SunriseTestRole",
        });
        expect(command.input.TagKeys).toHaveLength(1);
        removedTagKeys.push(command.input.TagKeys?.[0] ?? "");
        return Promise.resolve({});
      }
      if (command instanceof TagRoleCommand) {
        expect(command.input).toEqual({
          RoleName: "SunriseTestRole",
          Tags: [
            { Key: "owner", Value: "platform" },
            { Key: "scope", Value: "metadata" },
            { Key: "cost-center", Value: "1234" },
          ],
        });
        return Promise.resolve({});
      }
      throw new Error("Unexpected IAM command");
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await updateIamRoleTags(
      { projectId: "project-a", regionId: "RegionOne" },
      "SunriseTestRole",
      [
        { key: "owner", value: "platform" },
        { key: "scope", value: "metadata" },
        { key: "unchanged", value: "yes" },
        { key: "cost-center", value: "1234" },
      ],
    );

    expect(result).toMatchObject({
      ok: true,
      message: "Role tags saved.",
    });
    expect(removedTagKeys).toEqual(["owner", "environment", "scope"]);
    expect(client.send).toHaveBeenCalledTimes(6);
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("collapses legacy duplicate RGW tag entries to one map value", async () => {
    const client = createClient();
    let listRequest = 0;
    client.send.mockImplementation((command) => {
      if (command instanceof ListRoleTagsCommand) {
        listRequest += 1;
        return Promise.resolve({
          Tags:
            listRequest === 1
              ? [
                  { Key: "owner", Value: "sunrise" },
                  { Key: "owner", Value: "sunrise" },
                ]
              : [{ Key: "owner", Value: "sunrise" }],
          IsTruncated: false,
        });
      }
      if (command instanceof UntagRoleCommand) {
        expect(command.input.TagKeys).toEqual(["owner"]);
        return Promise.resolve({});
      }
      if (command instanceof TagRoleCommand) {
        expect(command.input.Tags).toEqual([
          { Key: "owner", Value: "sunrise" },
        ]);
        return Promise.resolve({});
      }
      throw new Error("Unexpected IAM command");
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await updateIamRoleTags(
      { projectId: "project-a", regionId: "RegionOne" },
      "SunriseTestRole",
      [{ key: "owner", value: "sunrise" }],
    );

    expect(result.ok).toBe(true);
    expect(client.send).toHaveBeenCalledTimes(4);
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("does not rewrite an unchanged role tag map", async () => {
    const client = createClient();
    client.send.mockResolvedValue({
      Tags: [
        { Key: "environment", Value: "development" },
        { Key: "scope", Value: "objects" },
      ],
      IsTruncated: false,
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await updateIamRoleTags(
      { projectId: "project-a", regionId: "RegionOne" },
      "SunriseTestRole",
      [
        { key: "scope", value: "objects" },
        { key: "environment", value: "development" },
      ],
    );

    expect(result.ok).toBe(true);
    expect(client.send).toHaveBeenCalledOnce();
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("reports when RGW accepts but does not persist role tags", async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      if (command instanceof ListRoleTagsCommand) {
        return Promise.resolve({ Tags: [], IsTruncated: false });
      }
      if (command instanceof TagRoleCommand) return Promise.resolve({});
      throw new Error("Unexpected IAM command");
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await updateIamRoleTags(
      { projectId: "project-a", regionId: "RegionOne" },
      "SunriseTestRole",
      [{ key: "owner", value: "sunrise" }],
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid-response",
        message: expect.stringContaining("do not match"),
      },
    });
    expect(client.destroy).toHaveBeenCalledOnce();
  });

  it("refuses to mutate or delete the current access role", async () => {
    const client = createClient();
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });
    const trustPolicy = JSON.stringify({
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: activeRoleArn },
          Action: "sts:AssumeRole",
        },
      ],
    });

    const updateResult = await updateIamRoleTrustPolicy(
      { projectId: "project-a", regionId: "RegionOne" },
      "AssumeRoleSunriseReadWrite",
      trustPolicy,
    );
    const deleteResult = await deleteIamRole(
      { projectId: "project-a", regionId: "RegionOne" },
      "AssumeRoleSunriseReadWrite",
    );
    const tagResult = await updateIamRoleTags(
      { projectId: "project-a", regionId: "RegionOne" },
      "AssumeRoleSunriseReadWrite",
      [{ key: "owner", value: "sunrise" }],
    );

    expect(updateResult).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message:
          "The current access role cannot be changed from its own Sunrise session.",
      },
    });
    expect(deleteResult).toMatchObject({ ok: false });
    expect(tagResult).toMatchObject({ ok: false });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("saves inline policies and attaches only Ceph managed policies", async () => {
    const inlineClient = createClient();
    inlineClient.send.mockImplementation((command) => {
      expect(command).toBeInstanceOf(PutRolePolicyCommand);
      expect(command.input.PolicyName).toBe("ReadArtifacts");
      expect(JSON.parse(command.input.PolicyDocument ?? "{}")).toMatchObject({
        Statement: [{ Action: "s3:GetObject" }],
      });
      return Promise.resolve({});
    });
    const attachClient = createClient();
    attachClient.send.mockImplementation((command) => {
      expect(command).toBeInstanceOf(AttachRolePolicyCommand);
      expect(command.input.PolicyArn).toBe(
        "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
      );
      return Promise.resolve({});
    });
    mocks.getActiveRoleIamContext
      .mockResolvedValueOnce({
        client: inlineClient,
        roleArn: activeRoleArn,
        roleName: "AssumeRoleSunriseReadWrite",
      })
      .mockResolvedValueOnce({
        client: attachClient,
        roleArn: activeRoleArn,
        roleName: "AssumeRoleSunriseReadWrite",
      });
    const scope = { projectId: "project-a", regionId: "RegionOne" };

    const inlineResult = await putIamInlineRolePolicy(
      scope,
      "SunriseTestRole",
      "ReadArtifacts",
      JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::artifacts/*",
          },
        ],
      }),
    );
    const attachResult = await attachIamManagedRolePolicy(
      scope,
      "SunriseTestRole",
      "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
    );

    expect(inlineResult.ok).toBe(true);
    expect(attachResult.ok).toBe(true);
  });

  it("rejects unsupported managed policies without contacting RGW", async () => {
    const client = createClient();
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await attachIamManagedRolePolicy(
      { projectId: "project-a", regionId: "RegionOne" },
      "SunriseTestRole",
      "arn:aws:iam::aws:policy/AdministratorAccess",
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation-failed",
        message: "Select a managed policy supported by Ceph RGW.",
      },
    });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("explains why a role with policies cannot be deleted", async () => {
    const client = createClient();
    client.send.mockImplementation((command) => {
      expect(command).toBeInstanceOf(DeleteRoleCommand);
      return Promise.reject(
        Object.assign(new Error("Role has policies"), {
          name: "DeleteConflict",
          $metadata: { httpStatusCode: 409, requestId: "tx-delete-conflict" },
        }),
      );
    });
    mocks.getActiveRoleIamContext.mockResolvedValue({
      client,
      roleArn: activeRoleArn,
      roleName: "AssumeRoleSunriseReadWrite",
    });

    const result = await deleteIamRole(
      { projectId: "project-a", regionId: "RegionOne" },
      "SunriseTestRole",
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "conflict",
        message:
          "Remove inline policies and detach managed policies before deleting this role.",
      },
    });
  });

  it("requires S3 authentication when IAM credentials are unavailable", async () => {
    mocks.getActiveRoleIamContext.mockRejectedValue(new S3AuthRequiredError());

    await expect(listRoles()).resolves.toEqual({
      ok: false,
      needsAuth: true,
    });
    await expect(getAccessRoleDetails()).resolves.toEqual({
      ok: false,
      needsAuth: true,
    });
  });
});
