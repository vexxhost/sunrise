export function bucketArn(bucket: string): string {
  return `arn:aws:s3:::${bucket}`;
}
