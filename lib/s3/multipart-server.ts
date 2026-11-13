import "server-only";

import { z } from "zod";
import { guardMutationContext } from "@/lib/mutation-context";
import { unavailableS3RouteResponse } from "@/lib/object-storage/route-guard";
import { getS3Client, S3AuthRequiredError } from "@/lib/s3/client";
import { describeS3UploadError } from "@/lib/s3/upload-error";

export interface S3MultipartRouteContext {
  params: Promise<{ bucket: string }>;
}

export const s3MultipartObjectKey = z
  .string()
  .min(1)
  .max(1024)
  .transform((value) => value.replace(/^\/+/, "").replace(/\/{2,}/g, "/"))
  .refine((value) => value.length > 0 && !value.endsWith("/"), {
    message: "Object key must identify a file",
  });

export function s3MultipartInvalidInput(error: z.ZodError) {
  return Response.json(
    {
      ok: false,
      needsAuth: false,
      error: error.issues[0]?.message ?? "Invalid multipart upload request",
    },
    { status: 400 },
  );
}

export function s3MultipartUploadError(error: unknown) {
  if (error instanceof S3AuthRequiredError) {
    return Response.json({ ok: false, needsAuth: true }, { status: 401 });
  }
  const candidate = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const code = candidate?.name ?? candidate?.Code ?? candidate?.code;
  const missingUpload = code === "NoSuchUpload";
  return Response.json(
    {
      ok: false,
      needsAuth: false,
      code: code ?? null,
      error: describeS3UploadError(error),
    },
    { status: missingUpload ? 404 : 502 },
  );
}

export async function prepareS3MultipartMutation(request: Request) {
  const expectedProjectId = request.headers.get("x-sunrise-project-id") ?? "";
  const guarded = await guardMutationContext(
    { projectId: expectedProjectId },
    { requireProjectToken: false, requireRegion: false },
  );
  if (!guarded.ok) {
    const { error } = guarded.result;
    return {
      ok: false as const,
      response: Response.json(
        {
          ok: false,
          needsAuth: error.code === "authentication-required",
          error: error.message,
        },
        {
          status:
            error.code === "authentication-required"
              ? 401
              : error.code === "context-changed"
                ? 409
                : 400,
        },
      ),
    };
  }

  const unavailable = await unavailableS3RouteResponse(request);
  if (unavailable) return { ok: false as const, response: unavailable };

  try {
    return {
      ok: true as const,
      client: await getS3Client({ allowCredentialRefresh: true }),
    };
  } catch (error) {
    return { ok: false as const, response: s3MultipartUploadError(error) };
  }
}

export async function s3MultipartBucketName(context: S3MultipartRouteContext) {
  return decodeURIComponent((await context.params).bucket);
}
