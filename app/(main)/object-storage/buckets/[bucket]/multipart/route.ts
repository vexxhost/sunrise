import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  UploadPartCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { z } from "zod";
import { guardMutationContext } from "@/lib/mutation-context";
import { unavailableS3RouteResponse } from "@/lib/object-storage/route-guard";
import { getS3Client, S3AuthRequiredError } from "@/lib/s3/client";
import { S3_MULTIPART_MAX_PART_SIZE_BYTES } from "@/lib/s3/multipart-policy";
import { describeS3UploadError } from "@/lib/s3/upload-error";

interface RouteContext {
  params: Promise<{ bucket: string }>;
}
const objectKey = z
  .string()
  .min(1)
  .max(1024)
  .transform((value) => value.replace(/^\/+/, "").replace(/\/{2,}/g, "/"))
  .refine((value) => value.length > 0 && !value.endsWith("/"), {
    message: "Object key must identify a file",
  });

const postInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check"),
    keys: z.array(objectKey).min(1).max(1000),
  }),
  z.object({
    action: z.literal("initiate"),
    key: objectKey,
    contentType: z.string().max(255).optional(),
  }),
  z.object({
    action: z.literal("complete"),
    key: objectKey,
    uploadId: z.string().min(1).max(2048),
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().min(1).max(10_000),
          etag: z.string().min(1).max(512),
        }),
      )
      .min(1)
      .max(10_000),
  }),
]);

const abortInput = z.object({
  key: objectKey,
  uploadId: z.string().min(1).max(2048),
});

function isNoSuchObject(error: unknown) {
  const candidate = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = candidate?.name ?? candidate?.Code;
  return (
    name === "NotFound" ||
    name === "NoSuchKey" ||
    candidate?.$metadata?.httpStatusCode === 404
  );
}

function invalidInput(error: z.ZodError) {
  return Response.json(
    {
      ok: false,
      needsAuth: false,
      error: error.issues[0]?.message ?? "Invalid multipart upload request",
    },
    { status: 400 },
  );
}

function uploadError(error: unknown) {
  if (error instanceof S3AuthRequiredError) {
    return Response.json({ ok: false, needsAuth: true }, { status: 401 });
  }
  return Response.json(
    { ok: false, needsAuth: false, error: describeS3UploadError(error) },
    { status: 502 },
  );
}

async function mutationClient(request: Request) {
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
    return { ok: false as const, response: uploadError(error) };
  }
}

async function bucketName(context: RouteContext) {
  return decodeURIComponent((await context.params).bucket);
}

async function checkConflicts(
  client: S3Client,
  bucket: string,
  keys: string[],
) {
  const conflicts = new Set<string>();
  const seenKeys = new Set<string>();
  const uniqueKeys: string[] = [];
  for (const key of keys) {
    if (seenKeys.has(key)) {
      conflicts.add(key);
    } else {
      seenKeys.add(key);
      uniqueKeys.push(key);
    }
  }
  let nextKey = 0;

  const worker = async () => {
    while (nextKey < uniqueKeys.length) {
      const key = uniqueKeys[nextKey];
      nextKey += 1;
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        conflicts.add(key);
      } catch (error) {
        if (!isNoSuchObject(error)) throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(10, uniqueKeys.length) }, () => worker()),
  );
  return Array.from(conflicts);
}

export async function POST(request: Request, context: RouteContext) {
  const prepared = await mutationClient(request);
  if (!prepared.ok) return prepared.response;

  try {
    const parsed = postInput.safeParse(await request.json());
    if (!parsed.success) return invalidInput(parsed.error);
    const bucket = await bucketName(context);

    if (parsed.data.action === "check") {
      const existingKeys = await checkConflicts(
        prepared.client,
        bucket,
        parsed.data.keys,
      );
      return Response.json({ ok: true, existingKeys });
    }

    if (parsed.data.action === "initiate") {
      const response = await prepared.client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: parsed.data.key,
          ContentType: parsed.data.contentType || undefined,
        }),
      );
      if (!response.UploadId) {
        throw new Error("RGW did not return a multipart upload ID");
      }
      return Response.json({ ok: true, uploadId: response.UploadId });
    }

    const parts = [...parsed.data.parts]
      .sort((left, right) => left.partNumber - right.partNumber)
      .map((part) => ({ ETag: part.etag, PartNumber: part.partNumber }));
    const response = await prepared.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: parsed.data.key,
        UploadId: parsed.data.uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
    return Response.json({ ok: true, etag: response.ETag ?? null });
  } catch (error) {
    return uploadError(error);
  }
}
export async function PUT(request: Request, context: RouteContext) {
  const prepared = await mutationClient(request);
  if (!prepared.ok) return prepared.response;

  try {
    const url = new URL(request.url);
    const parsed = z
      .object({
        key: objectKey,
        uploadId: z.string().min(1).max(2048),
        partNumber: z.coerce.number().int().min(1).max(10_000),
        contentLength: z.coerce
          .number()
          .int()
          .min(1)
          .max(S3_MULTIPART_MAX_PART_SIZE_BYTES),
      })
      .safeParse({
        key: url.searchParams.get("key"),
        uploadId: url.searchParams.get("uploadId"),
        partNumber: url.searchParams.get("partNumber"),
        contentLength: request.headers.get("x-sunrise-part-size"),
      });
    if (!parsed.success) return invalidInput(parsed.error);
    if (!request.body) {
      return Response.json(
        { ok: false, needsAuth: false, error: "Missing upload part body" },
        { status: 400 },
      );
    }
    const actualContentLength = request.headers.get("content-length");
    if (
      actualContentLength !== null &&
      Number(actualContentLength) !== parsed.data.contentLength
    ) {
      return Response.json(
        {
          ok: false,
          needsAuth: false,
          error: "Upload part size does not match the request body",
        },
        { status: 400 },
      );
    }

    const bucket = await bucketName(context);
    const body = Readable.fromWeb(
      request.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    const response = await prepared.client.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: parsed.data.key,
        UploadId: parsed.data.uploadId,
        PartNumber: parsed.data.partNumber,
        ContentLength: parsed.data.contentLength,
        Body: body,
      }),
    );
    if (!response.ETag)
      throw new Error("RGW did not return an upload part ETag");
    return Response.json({ ok: true, etag: response.ETag });
  } catch (error) {
    return uploadError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const prepared = await mutationClient(request);
  if (!prepared.ok) return prepared.response;

  try {
    const parsed = abortInput.safeParse(await request.json());
    if (!parsed.success) return invalidInput(parsed.error);
    await prepared.client.send(
      new AbortMultipartUploadCommand({
        Bucket: await bucketName(context),
        Key: parsed.data.key,
        UploadId: parsed.data.uploadId,
      }),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return uploadError(error);
  }
}
