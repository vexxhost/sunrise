import {
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import { redirect } from 'next/navigation';
import { getS3Client, S3AuthRequiredError } from '@/lib/s3/client';

interface RouteContext {
  params: Promise<{ bucket: string }>;
}

type SelectedEntry =
  | { kind: 'folder'; fullPath: string }
  | { kind: 'object'; fullPath: string };

type ZipEntry = {
  path: string;
  data: Uint8Array;
  crc: number;
};

const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
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

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

function safeZipPath(key: string): string {
  const normalized = normalizeKey(key);
  return normalized
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatParts(parts: Uint8Array[], totalLength: number): Uint8Array {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function makeZip(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const localHeader = new Uint8Array(30 + name.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, entry.crc);
    writeUint32(localHeader, 18, entry.data.length);
    writeUint32(localHeader, 22, entry.data.length);
    writeUint16(localHeader, 26, name.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(name, 30);
    parts.push(localHeader, entry.data);

    const centralDirectory = new Uint8Array(46 + name.length);
    writeUint32(centralDirectory, 0, 0x02014b50);
    writeUint16(centralDirectory, 4, 20);
    writeUint16(centralDirectory, 6, 20);
    writeUint16(centralDirectory, 8, 0x0800);
    writeUint16(centralDirectory, 10, 0);
    writeUint16(centralDirectory, 12, 0);
    writeUint16(centralDirectory, 14, 0);
    writeUint32(centralDirectory, 16, entry.crc);
    writeUint32(centralDirectory, 20, entry.data.length);
    writeUint32(centralDirectory, 24, entry.data.length);
    writeUint16(centralDirectory, 28, name.length);
    writeUint16(centralDirectory, 30, 0);
    writeUint16(centralDirectory, 32, 0);
    writeUint16(centralDirectory, 34, 0);
    writeUint16(centralDirectory, 36, 0);
    writeUint32(centralDirectory, 38, 0);
    writeUint32(centralDirectory, 42, offset);
    centralDirectory.set(name, 46);
    centralDirectoryParts.push(centralDirectory);

    offset += localHeader.length + entry.data.length;
  }

  const centralDirectorySize = centralDirectoryParts.reduce(
    (total, part) => total + part.length,
    0
  );
  const centralDirectoryOffset = offset;
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectorySize);
  writeUint32(end, 16, centralDirectoryOffset);
  writeUint16(end, 20, 0);

  const totalLength =
    parts.reduce((total, part) => total + part.length, 0) +
    centralDirectorySize +
    end.length;
  return concatParts([...parts, ...centralDirectoryParts, end], totalLength);
}

async function getObjectBytes(
  client: S3Client,
  bucket: string,
  key: string
): Promise<Uint8Array> {
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  if (!response.Body) {
    throw new Error(`Object ${key} had no response body`);
  }
  return response.Body.transformToByteArray();
}

async function listFolderKeys(
  client: S3Client,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );

    for (const object of response.Contents ?? []) {
      if (object.Key && object.Key !== prefix) {
        keys.push(object.Key);
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}

async function collectKeys(
  client: S3Client,
  bucket: string,
  entries: SelectedEntry[]
): Promise<string[]> {
  const keys = new Set<string>();
  const folderPrefixes = entries
    .filter((entry): entry is Extract<SelectedEntry, { kind: 'folder' }> => {
      return entry.kind === 'folder';
    })
    .map((entry) => normalizePrefix(entry.fullPath))
    .filter(Boolean);

  for (const entry of entries) {
    if (entry.kind !== 'object') continue;
    const key = normalizeKey(entry.fullPath);
    if (key) keys.add(key);
  }

  for (const prefix of folderPrefixes) {
    const folderKeys = await listFolderKeys(client, bucket, prefix);
    for (const key of folderKeys) {
      keys.add(key);
    }
  }

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function zipFileName(bucket: string): string {
  return `${bucket || 'objects'}-selected.zip`.replace(/["\\]/g, '_');
}

export async function POST(request: Request, { params }: RouteContext) {
  const { bucket: rawBucket } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const formData = await request.formData();
  const rawEntries = formData.get('entries');

  if (typeof rawEntries !== 'string') {
    return new Response('Missing selected entries', { status: 400 });
  }

  let entries: SelectedEntry[];
  try {
    entries = JSON.parse(rawEntries) as SelectedEntry[];
  } catch {
    return new Response('Invalid selected entries', { status: 400 });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return new Response('No selected entries', { status: 400 });
  }

  try {
    const client = await getS3Client();
    const keys = await collectKeys(client, bucket, entries);
    if (keys.length === 0) {
      return new Response('Selected folders contain no objects', { status: 404 });
    }

    const zipEntries: ZipEntry[] = [];
    for (const key of keys) {
      const path = safeZipPath(key);
      if (!path) continue;
      const data = await getObjectBytes(client, bucket, key);
      zipEntries.push({ path, data, crc: crc32(data) });
    }

    const zip = makeZip(zipEntries);
    const fileName = zipFileName(bucket);
    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`
    );
    headers.set('Content-Length', String(zip.length));

    return new Response(zip, { headers });
  } catch (e) {
    if (e instanceof S3AuthRequiredError) {
      redirect('/object-storage/auth/login');
    }
    return new Response(describeAwsError(e), { status: 502 });
  }
}
