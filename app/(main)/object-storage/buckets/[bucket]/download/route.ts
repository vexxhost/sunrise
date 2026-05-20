import { GetObjectCommand } from '@aws-sdk/client-s3';
import { redirect } from 'next/navigation';
import { getS3Client, S3AuthRequiredError } from '@/lib/s3/client';

interface RouteContext {
  params: Promise<{ bucket: string }>;
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)
    .replace(/\*/g, '%2A');
}

function objectFileName(key: string): string {
  return key.split('/').filter(Boolean).pop() || 'download';
}

function fallbackFileName(name: string): string {
  return name.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_');
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

export async function GET(request: Request, { params }: RouteContext) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const key = new URL(request.url).searchParams.get('key');

  if (!key) {
    return new Response('Missing object key', { status: 400 });
  }

  try {
    const client = await getS3Client();
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    const body = res.Body;
    if (!body) {
      return new Response('Object response had no body', { status: 502 });
    }

    const stream =
      typeof body.transformToWebStream === 'function'
        ? body.transformToWebStream()
        : new ReadableStream({
            async start(controller) {
              const bytes = await body.transformToByteArray();
              controller.enqueue(bytes);
              controller.close();
            },
          });

    const rawFileName = objectFileName(key);
    const fileName = fallbackFileName(rawFileName);
    const headers = new Headers();
    headers.set(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeRfc5987(
        rawFileName
      )}`
    );
    headers.set('Content-Type', res.ContentType || 'application/octet-stream');
    if (typeof res.ContentLength === 'number') {
      headers.set('Content-Length', String(res.ContentLength));
    }
    if (res.ETag) headers.set('ETag', res.ETag);
    if (res.LastModified) {
      headers.set('Last-Modified', res.LastModified.toUTCString());
    }

    return new Response(stream, { headers });
  } catch (e) {
    if (e instanceof S3AuthRequiredError) {
      redirect('/object-storage/auth/login');
    }
    return new Response(describeAwsError(e), { status: 502 });
  }
}
