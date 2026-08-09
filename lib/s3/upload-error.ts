type S3ErrorLike = {
  name?: string;
  Code?: string;
  code?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
};

export function describeS3UploadError(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  const candidate = error as S3ErrorLike;
  const status = candidate.$metadata?.httpStatusCode;
  if (status === 499) {
    return 'The upload connection closed before RGW accepted the object (HTTP 499). Retry the upload, or use Direct browser mode for large files.';
  }

  const name = candidate.name ?? candidate.Code ?? candidate.code ?? 'Error';
  return `${name}${status ? ` (${status})` : ''}: ${
    candidate.message || String(error)
  }`;
}
