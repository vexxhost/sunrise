import { describe, expect, it } from "vitest";
import {
  defaultIamTrustPolicy,
  isSupportedRgwManagedPolicy,
  validateIamPolicyName,
  validateIamRoleName,
  validateIamRolePath,
  validateIamRoleTags,
  validateIamSessionDuration,
} from "@/lib/s3/role-policy";

describe("RGW IAM role validation", () => {
  it("accepts the IAM role and policy character set", () => {
    expect(validateIamRoleName("sunrise_test+1@example.com")).toBeNull();
    expect(validateIamPolicyName("S3.Read-Only_v1")).toBeNull();
  });

  it("rejects invalid names and paths", () => {
    expect(validateIamRoleName("role with spaces")).toContain("letters");
    expect(validateIamPolicyName("policy/child")).toContain("letters");
    expect(validateIamRolePath("applications/")).toContain("start and end");
    expect(validateIamRolePath("/applications/*/")).toContain("asterisk");
    expect(validateIamRolePath("/applications/")).toBeNull();
  });

  it("enforces the RGW session duration range", () => {
    expect(validateIamSessionDuration(3599)).toContain("1 and 12 hours");
    expect(validateIamSessionDuration(3600)).toBeNull();
    expect(validateIamSessionDuration(43200)).toBeNull();
    expect(validateIamSessionDuration(43201)).toContain("1 and 12 hours");
  });

  it("treats role tags as a unique key-value map", () => {
    expect(
      validateIamRoleTags([
        { key: "project-access", value: "project-a:readwrite" },
        { key: "environment", value: "development" },
      ]),
    ).toBeNull();
    expect(
      validateIamRoleTags([
        { key: "project-access", value: "project-a:readwrite" },
        { key: "project-access", value: "project-b:readonly" },
      ]),
    ).toContain("must be unique");
  });

  it("recognizes only Ceph managed policies", () => {
    expect(
      isSupportedRgwManagedPolicy(
        "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
      ),
    ).toBe(true);
    expect(
      isSupportedRgwManagedPolicy(
        "arn:aws:iam::aws:policy/AdministratorAccess",
      ),
    ).toBe(false);
  });

  it("builds a valid default trust for the current access role", () => {
    const activeRoleArn = "arn:aws:iam::RGW1:role/sunrise/Access";
    const policy = JSON.parse(defaultIamTrustPolicy(activeRoleArn));

    expect(policy.Statement[0].Principal.AWS).toBe(activeRoleArn);
    expect(policy.Statement[0].Action).toBe("sts:AssumeRole");
  });
});
