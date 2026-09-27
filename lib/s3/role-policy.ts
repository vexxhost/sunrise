export type RgwManagedPolicy = {
  name: string;
  arn: string;
  description: string;
};

export const RGW_MANAGED_POLICIES: RgwManagedPolicy[] = [
  {
    name: "IAMFullAccess",
    arn: "arn:aws:iam::aws:policy/IAMFullAccess",
    description: "Full access to RGW IAM users, groups, roles, and policies.",
  },
  {
    name: "IAMReadOnlyAccess",
    arn: "arn:aws:iam::aws:policy/IAMReadOnlyAccess",
    description: "Read-only access to RGW IAM metadata.",
  },
  {
    name: "AmazonSNSFullAccess",
    arn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
    description: "Full access to the RGW SNS-compatible API.",
  },
  {
    name: "AmazonSNSReadOnlyAccess",
    arn: "arn:aws:iam::aws:policy/AmazonSNSReadOnlyAccess",
    description: "Read-only access to the RGW SNS-compatible API.",
  },
  {
    name: "AmazonS3FullAccess",
    arn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
    description: "Full access to S3 resources in the active RGW account.",
  },
  {
    name: "AmazonS3ReadOnlyAccess",
    arn: "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
    description: "Read-only access to S3 resources in the active RGW account.",
  },
];

const roleNamePattern = /^[A-Za-z0-9_+=,.@-]+$/;
const policyNamePattern = /^[A-Za-z0-9_+=,.@-]+$/;
const printableAsciiPattern = /^[\x21-\x7e]+$/;

export function validateIamRoleName(value: string) {
  if (!value) return "Enter a role name.";
  if (value.length > 64) return "Role names cannot exceed 64 characters.";
  if (!roleNamePattern.test(value)) {
    return "Use letters, numbers, or _+=,.@- characters.";
  }
  return null;
}

export function validateIamPolicyName(value: string) {
  if (!value) return "Enter a policy name.";
  if (value.length > 128) return "Policy names cannot exceed 128 characters.";
  if (!policyNamePattern.test(value)) {
    return "Use letters, numbers, or _+=,.@- characters.";
  }
  return null;
}

export function validateIamRolePath(value: string) {
  if (!value) return "Enter a path.";
  if (value.length > 512) return "Role paths cannot exceed 512 characters.";
  if (value === "/") return null;
  if (!value.startsWith("/") || !value.endsWith("/")) {
    return "Role paths must start and end with a slash.";
  }
  if (!printableAsciiPattern.test(value) || value.includes("*")) {
    return "Use printable characters other than an asterisk.";
  }
  return null;
}

export function validateIamRoleDescription(value: string) {
  if (value.length > 1000) {
    return "Role descriptions cannot exceed 1,000 characters.";
  }
  return null;
}

export function validateIamSessionDuration(value: number) {
  if (!Number.isInteger(value) || value < 3600 || value > 43200) {
    return "Maximum session duration must be between 1 and 12 hours.";
  }
  return null;
}

export function validateIamRoleTags(
  tags: Array<{ key: string; value: string }>,
) {
  if (tags.length > 50) return "Roles cannot have more than 50 tags.";
  const keys = new Set<string>();
  for (const [index, tag] of tags.entries()) {
    if (!tag.key) return `Tag ${index + 1} needs a key.`;
    if (tag.key.length > 128) {
      return `Tag ${index + 1} key cannot exceed 128 characters.`;
    }
    if (tag.value.length > 256) {
      return `Tag ${index + 1} value cannot exceed 256 characters.`;
    }
    if (keys.has(tag.key)) {
      return `Tag key "${tag.key}" is used more than once. Tag keys must be unique.`;
    }
    keys.add(tag.key);
  }
  return null;
}

export function isSupportedRgwManagedPolicy(arn: string) {
  return RGW_MANAGED_POLICIES.some((policy) => policy.arn === arn);
}

export function defaultIamTrustPolicy(activeRoleArn: string) {
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowCurrentRole",
          Effect: "Allow",
          Principal: { AWS: activeRoleArn },
          Action: "sts:AssumeRole",
        },
      ],
    },
    null,
    2,
  );
}

export function defaultIamPermissionPolicy() {
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "ListBuckets",
          Effect: "Allow",
          Action: "s3:ListAllMyBuckets",
          Resource: "*",
        },
      ],
    },
    null,
    2,
  );
}
