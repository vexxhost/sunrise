import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import {
  prepareS3MultipartMutation,
  s3MultipartBucketName,
  s3MultipartInvalidInput,
  s3MultipartObjectKey,
  s3MultipartUploadError,
  type S3MultipartRouteContext,
} from "@/lib/s3/multipart-server";

const postInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check"),
    keys: z.array(s3MultipartObjectKey).min(1).max(1000),
  }),
  z.object({
    action: z.literal("initiate"),
    key: s3MultipartObjectKey,
    contentType: z.string().max(255).optional(),
  }),
  z.object({
    action: z.literal("list"),
    key: s3MultipartObjectKey,
    uploadId: z.string().min(1).max(2048),
  }),
  z.object({
    action: z.literal("complete"),
    key: s3MultipartObjectKey,
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
  key: s3MultipartObjectKey,
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

export async function POST(request: Request, context: S3MultipartRouteContext) {
  const prepared = await prepareS3MultipartMutation(request);
  if (!prepared.ok) return prepared.response;

  try {
    const parsed = postInput.safeParse(await request.json());
    if (!parsed.success) return s3MultipartInvalidInput(parsed.error);
    const bucket = await s3MultipartBucketName(context);

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

    if (parsed.data.action === "list") {
      const parts: { partNumber: number; etag: string; size: number }[] = [];
      let partNumberMarker: string | undefined;
      do {
        const response = await prepared.client.send(
          new ListPartsCommand({
            Bucket: bucket,
            Key: parsed.data.key,
            UploadId: parsed.data.uploadId,
            PartNumberMarker: partNumberMarker,
          }),
        );
        for (const part of response.Parts ?? []) {
          if (
            typeof part.PartNumber === "number" &&
            typeof part.ETag === "string" &&
            typeof part.Size === "number"
          ) {
            parts.push({
              partNumber: part.PartNumber,
              etag: part.ETag,
              size: part.Size,
            });
          }
        }
        partNumberMarker = response.IsTruncated
          ? response.NextPartNumberMarker
          : undefined;
      } while (partNumberMarker);
      return Response.json({ ok: true, parts });
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
    return s3MultipartUploadError(error);
  }
}

export async function DELETE(
  request: Request,
  context: S3MultipartRouteContext,
) {
  const prepared = await prepareS3MultipartMutation(request);
  if (!prepared.ok) return prepared.response;

  try {
    const parsed = abortInput.safeParse(await request.json());
    if (!parsed.success) return s3MultipartInvalidInput(parsed.error);
    await prepared.client.send(
      new AbortMultipartUploadCommand({
        Bucket: await s3MultipartBucketName(context),
        Key: parsed.data.key,
        UploadId: parsed.data.uploadId,
      }),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return s3MultipartUploadError(error);
  }
}
