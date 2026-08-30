export function validateBucketName(value: string): string | null {
  const name = value.trim();
  if (name.length < 3 || name.length > 63) {
    return 'Bucket names must contain between 3 and 63 characters.';
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) {
    return 'Use lowercase letters, numbers, periods, and hyphens; start and end with a letter or number.';
  }
  if (name.includes('..') || name.includes('.-') || name.includes('-.')) {
    return 'Periods and hyphens cannot be adjacent in a bucket name.';
  }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(name)) {
    return 'Bucket names cannot use an IP address format.';
  }
  return null;
}
