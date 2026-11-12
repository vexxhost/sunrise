import { UploadPartCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { z } from "zod";
import { S3_MULTIPART_MAX_PART_SIZE_BYTES } from "@/lib/s3/multipart-policy";
import {
  prepareS3MultipartMutation,
  s3MultipartBucketName,
  s3MultipartInvalidInput,
  s3MultipartObjectKey,
  s3MultipartUploadError,
  type S3MultipartRouteContext,
} from "@/lib/s3/multipart-server";

export async function PUT(
  request: Request,
  context: S3MultipartRouteContext,
) {
  const prepared = await prepareS3MultipartMutation(request);
  if (!prepared.ok) return prepared.response;

  try {
    const url = new URL(request.url);
    const parsed = z
      .object({
        key: s3MultipartObjectKey,
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
    if (!parsed.success) return s3MultipartInvalidInput(parsed.error);
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

    const body = Readable.fromWeb(
      request.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    const response = await prepared.client.send(
      new UploadPartCommand({
        Bucket: await s3MultipartBucketName(context),
        Key: parsed.data.key,
        UploadId: parsed.data.uploadId,
        PartNumber: parsed.data.partNumber,
        ContentLength: parsed.data.contentLength,
        Body: body,
      }),
    );
    if (!response.ETag) {
      throw new Error("RGW did not return an upload part ETag");
    }
    return Response.json({ ok: true, etag: response.ETag });
  } catch (error) {
    return s3MultipartUploadError(error);
  }
}
