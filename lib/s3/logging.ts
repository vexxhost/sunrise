import "server-only";

import { currentSunriseRequestId } from "@/lib/request-correlation.server";

type AwsFailure = Error & {
  Code?: string;
  code?: string;
  $metadata?: {
    extendedRequestId?: string;
    httpStatusCode?: number;
    requestId?: string;
  };
};

export async function s3FailureLogFields(error: unknown) {
  const failure = error instanceof Error ? (error as AwsFailure) : undefined;
  return {
    errorCode: failure?.Code ?? failure?.code ?? failure?.name,
    errorName: failure?.name ?? (error === null ? "null" : typeof error),
    requestId: await currentSunriseRequestId(),
    status: failure?.$metadata?.httpStatusCode,
    upstreamRequestId:
      failure?.$metadata?.requestId ?? failure?.$metadata?.extendedRequestId,
  };
}
