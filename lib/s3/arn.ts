export function bucketArn(bucket: string): string {
  return `arn:aws:s3:::${bucket}`;
}

export function roleNameFromArn(roleArn: string): string {
  const match = /^arn:[^:]+:iam::[^:]+:role\/(.+)$/.exec(roleArn);
  const roleResource = match?.[1];
  const roleName = roleResource?.split("/").filter(Boolean).at(-1);

  if (!roleName) {
    throw new Error(`Invalid IAM role ARN: ${roleArn}`);
  }

  return roleName;
}
