import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class {
    send = mocks.send;
  },
  AssumeRoleWithWebIdentityCommand: class {
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

vi.mock("@/lib/s3/endpoint", () => ({
  getS3Endpoint: vi.fn(),
  S3_REGION: "us-east-1",
}));

import { assumeRoleWithIdToken } from "@/lib/s3/sts";

const roleArn = "arn:aws:iam::RGW123456789:role/SunriseReadWrite";

function unknownRgwError() {
  return Object.assign(new Error("UnknownError"), {
    name: "UnknownError",
    $metadata: { httpStatusCode: 400 },
  });
}

describe("RGW STS role assumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains an opaque RGW failure for an extended session request", async () => {
    mocks.send.mockRejectedValue(unknownRgwError());

    await expect(
      assumeRoleWithIdToken(
        "id-token",
        "project-1",
        roleArn,
        "https://s3.example.test",
        7_200,
      ),
    ).rejects.toThrow(
      `RGW rejected the requested STS session duration of 7,200 seconds (2 hours) for role ${roleArn}. This usually means the requested duration exceeds the role's MaxSessionDuration.`,
    );
  });

  it("preserves opaque failures when an extended duration was not requested", async () => {
    mocks.send.mockRejectedValue(unknownRgwError());

    await expect(
      assumeRoleWithIdToken(
        "id-token",
        "project-1",
        roleArn,
        "https://s3.example.test",
        3_600,
      ),
    ).rejects.toThrow("UnknownError");
  });

  it("passes the configured duration to RGW", async () => {
    mocks.send.mockResolvedValue({
      Credentials: {
        AccessKeyId: "access-key",
        SecretAccessKey: "secret-key",
        SessionToken: "session-token",
        Expiration: new Date("2026-10-04T20:00:00Z"),
      },
    });

    await assumeRoleWithIdToken(
      "id-token",
      "project-1",
      roleArn,
      "https://s3.example.test",
      7_200,
    );

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          RoleArn: roleArn,
          DurationSeconds: 7_200,
        }),
      }),
    );
  });
});
