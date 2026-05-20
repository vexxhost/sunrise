import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Buffer } from 'node:buffer';
import { getS3Client, S3AuthRequiredError } from '@/lib/s3/client';

interface RouteContext {
  params: Promise<{ bucket: string }>;
}

function describeAwsError(e: unknown): string {
  if (e instanceof Error) {
    const anyErr = e as any;
    const name = anyErr.name || 'Error';
    const code = anyErr.Code || anyErr.$metadata?.httpStatusCode;
    const msg = anyErr.message || String(e);
    return `${name}${code ? ` (${code})` : ''}: ${msg}`;
  }
  return String(e);
}

function normalizeObjectKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

function isNoSuchObject(e: unknown): boolean {
  const anyErr = e as any;
  const name = anyErr?.name || anyErr?.Code;
  const status = anyErr?.$metadata?.httpStatusCode;
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const formData = await request.formData();
  const files = formData.getAll('files').filter((value): value is File => {
    return value instanceof File && value.size >= 0;
  });
  const requestedKeys = formData.getAll('keys').map((value) => String(value));
  const confirmOverwrite = formData.get('confirmOverwrite') === 'true';

  if (!bucket) {
    return Response.json(
      { ok: false, needsAuth: false, error: 'Missing bucket name' },
      { status: 400 }
    );
  }
  if (files.length === 0) {
    return Response.json(
      { ok: false, needsAuth: false, error: 'No files selected' },
      { status: 400 }
    );
  }

  try {
    const client = await getS3Client();
    const normalizedKeys = files.map((file, index) => {
      return normalizeObjectKey(requestedKeys[index] || file.name);
    });
    const invalidKey = normalizedKeys.find((key) => !key || key.endsWith('/'));
    if (invalidKey !== undefined) {
      return Response.json(
        {
          ok: false,
          needsAuth: false,
          error: `Invalid object key: ${invalidKey || '(empty)'}`,
        },
        { status: 400 }
      );
    }

    if (!confirmOverwrite) {
      const duplicates = normalizedKeys.filter((key, index) => {
        return normalizedKeys.indexOf(key) !== index;
      });
      const existingKeys = new Set(duplicates);

      for (const key of Array.from(new Set(normalizedKeys))) {
        try {
          await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          existingKeys.add(key);
        } catch (e) {
          if (isNoSuchObject(e)) continue;
          return Response.json(
            {
              ok: false,
              needsAuth: false,
              error: `Overwrite check failed for ${key}: ${describeAwsError(e)}`,
            },
            { status: 502 }
          );
        }
      }

      if (existingKeys.size > 0) {
        return Response.json(
          {
            ok: false,
            needsAuth: false,
            conflict: true,
            existingKeys: Array.from(existingKeys),
          },
          { status: 409 }
        );
      }
    }

    const errors: { key: string; error: string }[] = [];
    let uploaded = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const key = normalizedKeys[index];

      try {
        const body = Buffer.from(await file.arrayBuffer());
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: file.type || undefined,
          })
        );
        uploaded += 1;
      } catch (e) {
        errors.push({ key, error: describeAwsError(e) });
      }
    }

    return Response.json({ ok: true, uploaded, errors });
  } catch (e) {
    if (e instanceof S3AuthRequiredError) {
      return Response.json({ ok: false, needsAuth: true }, { status: 401 });
    }
    return Response.json(
      { ok: false, needsAuth: false, error: describeAwsError(e) },
      { status: 502 }
    );
  }
}
