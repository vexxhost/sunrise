'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Calculator,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Home,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import bytes from 'bytes';
import { DataTable } from '@/components/DataTable';
import {
  ObjectMetadataDetails,
  type ObjectMetadataDetailsData,
} from '@/components/ObjectMetadataDetails';
import { UploadQueueMenu } from '@/components/UploadQueueMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { makeBrowserS3Client } from '@/lib/s3/browser-client';
import { getStsCredentialsForBrowser } from '@/lib/s3/browser-creds';
import { directObjectPath } from '@/lib/s3/direct-route';
import {
  browserUploadKey,
  calculateBrowserSelectionSize,
  collectBrowserSelectionKeys,
  createBrowserFolder,
  describeBrowserS3Error,
  findBrowserUploadConflicts,
  getBrowserBucketPolicy,
  getBrowserDownloadUrl,
  isBrowserAccessDenied,
  listBrowserObjects,
  removeBrowserSelection,
  uploadBrowserFiles,
  type BrowserObjectRow,
  type BrowserSizeResult,
} from '@/lib/s3/browser-objects';
import { normalizeStorageClass } from '@/lib/s3/storage-class';

interface DirectClientProps {
  bucket: string;
  objectKey?: string;
}

type PolicyState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; bucketArn: string; policy: string | null }
  | { status: 'error'; error: string; accessDenied: boolean };

type SizeState = BrowserSizeResult & { label: string };

interface DirectDownload {
  key: string;
  url: string;
}

function filePath(file: File) {
  return (
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name
  );
}

function triggerNativeDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function DirectClient({ bucket, objectKey = '' }: DirectClientProps) {
  const searchParams = useSearchParams();
  const prefix = searchParams.get('prefix') ?? '';
  const inspectKey = objectKey;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [s3, setS3] = useState<S3Client | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [overwriteKeys, setOverwriteKeys] = useState<string[]>([]);
  const [folderName, setFolderName] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTargets, setRemoveTargets] = useState<BrowserObjectRow[]>([]);
  const [removing, setRemoving] = useState(false);
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [sizeBusy, setSizeBusy] = useState(false);
  const [sizeResult, setSizeResult] = useState<SizeState | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DirectDownload[]>([]);
  const [startedDownloads, setStartedDownloads] = useState<Set<string>>(
    () => new Set()
  );
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyState, setPolicyState] = useState<PolicyState>({
    status: 'idle',
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getStsCredentialsForBrowser();
      if (cancelled) return;
      if (!result.ok) {
        if (result.needsAuth) {
          window.location.href = '/object-storage/auth/login';
          return;
        }
        setCredsError(result.error);
        return;
      }
      setS3(
        makeBrowserS3Client(
          result.credentials,
          result.endpoint,
          result.region
        )
      );
      setEndpoint(result.endpoint);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const listQuery = useQuery({
    queryKey: ['s3-direct', 'objects', bucket, prefix],
    enabled: !!s3 && !inspectKey,
    retry: false,
    queryFn: () => listBrowserObjects(s3!, bucket, prefix),
  });

  const headQuery = useQuery({
    queryKey: ['s3-direct', 'head', bucket, inspectKey],
    enabled: !!s3 && !!inspectKey,
    retry: false,
    queryFn: () =>
      s3!.send(new HeadObjectCommand({ Bucket: bucket, Key: inspectKey })),
  });

  const rows = useMemo(() => listQuery.data?.rows ?? [], [listQuery.data?.rows]);
  const segments = useMemo(
    () =>
      prefix
        .replace(/\/$/, '')
        .split('/')
        .filter((segment) => segment.length > 0),
    [prefix]
  );
  const inspectSegments = useMemo(
    () => inspectKey.split('/').filter((segment) => segment.length > 0),
    [inspectKey]
  );
  const inspectedFileName = inspectSegments[inspectSegments.length - 1] ?? inspectKey;
  const inspectedMetadata = useMemo<ObjectMetadataDetailsData | null>(() => {
    if (!headQuery.data || !inspectKey) return null;
    return {
      bucket,
      key: inspectKey,
      size:
        typeof headQuery.data.ContentLength === 'number'
          ? headQuery.data.ContentLength
          : null,
      lastModified: headQuery.data.LastModified
        ? headQuery.data.LastModified.toISOString()
        : null,
      etag: headQuery.data.ETag ?? null,
      contentType: headQuery.data.ContentType ?? null,
      contentEncoding: headQuery.data.ContentEncoding ?? null,
      contentDisposition: headQuery.data.ContentDisposition ?? null,
      contentLanguage: headQuery.data.ContentLanguage ?? null,
      cacheControl: headQuery.data.CacheControl ?? null,
      storageClass: normalizeStorageClass(headQuery.data.StorageClass),
      versionId: headQuery.data.VersionId ?? null,
      serverSideEncryption: headQuery.data.ServerSideEncryption ?? null,
      sseKmsKeyId: headQuery.data.SSEKMSKeyId ?? null,
      metadata: headQuery.data.Metadata ?? {},
    };
  }, [bucket, headQuery.data, inspectKey]);

  const clearMessages = () => {
    setUploadMessage(null);
    setUploadError(null);
    setFolderMessage(null);
    setFolderError(null);
    setRemoveMessage(null);
    setRemoveError(null);
    setDownloadMessage(null);
    setDownloadError(null);
  };

  const handleFilesSelected = (input: HTMLInputElement) => {
    const selectedFiles = input.files ? Array.from(input.files) : [];
    if (selectedFiles.length > 0) {
      setUploadFiles((current) => [...current, ...selectedFiles]);
    }
    input.value = '';
    clearMessages();
    setUploadProgress(null);
    setOverwriteOpen(false);
    setOverwriteKeys([]);
  };

  const handleUpload = async (confirmOverwrite = false) => {
    if (!s3 || uploadFiles.length === 0 || uploading) return;
    clearMessages();
    setUploading(true);
    setUploadProgress(0);
    if (confirmOverwrite) setOverwriteOpen(false);

    const files = uploadFiles.map((file) => ({
      file,
      key: browserUploadKey(prefix, filePath(file)),
    }));

    try {
      if (!confirmOverwrite) {
        const conflicts = await findBrowserUploadConflicts(
          s3,
          bucket,
          files.map(({ key }) => key)
        );
        if (conflicts.length > 0) {
          setOverwriteKeys(conflicts);
          setOverwriteOpen(true);
          return;
        }
      }

      const result = await uploadBrowserFiles(
        s3,
        bucket,
        files,
        setUploadProgress
      );
      setUploadMessage(
        `Uploaded ${result.uploaded} ${
          result.uploaded === 1 ? 'object' : 'objects'
        } directly to RGW.`
      );
      if (result.errors.length > 0) {
        setUploadError(
          `${result.errors.length} upload failed. ${result.errors[0].key}: ${result.errors[0].error}`
        );
      }
      setUploadFiles([]);
      await listQuery.refetch();
    } catch (error) {
      setUploadError(describeBrowserS3Error(error));
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleCreateFolder = async () => {
    if (!s3 || !folderName.trim() || folderBusy) return;
    clearMessages();
    setFolderBusy(true);
    try {
      const key = await createBrowserFolder(s3, bucket, prefix, folderName);
      setFolderName('');
      setFolderMessage(`Created ${key} directly in RGW.`);
      await listQuery.refetch();
    } catch (error) {
      setFolderError(describeBrowserS3Error(error));
    } finally {
      setFolderBusy(false);
    }
  };

  const openRemoveDialog = (targets: BrowserObjectRow[]) => {
    if (targets.length === 0) return;
    clearMessages();
    setRemoveTargets(targets);
    setRemoveOpen(true);
  };

  const confirmRemove = async () => {
    if (!s3 || removeTargets.length === 0 || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const result = await removeBrowserSelection(s3, bucket, removeTargets);
      setRemoveOpen(false);
      setRemoveTargets([]);
      setRemoveMessage(
        `Removed ${result.deleted} ${
          result.deleted === 1 ? 'object' : 'objects'
        } directly from RGW.`
      );
      if (result.errors.length > 0) {
        setRemoveError(
          `${result.errors.length} delete failed. ${result.errors[0].key}: ${result.errors[0].error}`
        );
      }
      await listQuery.refetch();
    } catch (error) {
      setRemoveError(describeBrowserS3Error(error));
    } finally {
      setRemoving(false);
    }
  };

  const calculateRows = async (selectedRows: BrowserObjectRow[]) => {
    if (!s3 || selectedRows.length === 0 || sizeBusy) return;
    setSizeBusy(true);
    setSizeResult(null);
    setSizeError(null);
    try {
      const result = await calculateBrowserSelectionSize(
        s3,
        bucket,
        selectedRows
      );
      setSizeResult({
        ...result,
        label:
          selectedRows.length === 1
            ? selectedRows[0].name
            : `${selectedRows.length} selected items`,
      });
    } catch (error) {
      setSizeError(describeBrowserS3Error(error));
    } finally {
      setSizeBusy(false);
    }
  };

  const downloadRows = async (selectedRows: BrowserObjectRow[]) => {
    if (!s3 || selectedRows.length === 0 || downloadBusy) return;
    clearMessages();
    setDownloadOpen(false);
    setDownloadQueue([]);
    setStartedDownloads(new Set());
    setDownloadBusy(true);
    try {
      const keys = Array.from(
        new Set(
          (
            await collectBrowserSelectionKeys(s3, bucket, selectedRows)
          ).filter((key) => !key.endsWith('/'))
        )
      );

      if (keys.length === 0) {
        setDownloadError('No downloadable objects were found.');
        return;
      }

      const downloads: DirectDownload[] = [];
      for (const key of keys) {
        const url = await getBrowserDownloadUrl(s3, bucket, key);
        downloads.push({ key, url });
      }

      if (downloads.length === 1) {
        triggerNativeDownload(downloads[0].url);
        setDownloadMessage('Started 1 direct download.');
      } else {
        setDownloadQueue(downloads);
        setDownloadOpen(true);
      }
    } catch (error) {
      setDownloadError(describeBrowserS3Error(error));
    } finally {
      setDownloadBusy(false);
    }
  };

  const openPolicy = async () => {
    if (!s3) return;
    setPolicyOpen(true);
    setPolicyState({ status: 'loading' });
    try {
      const result = await getBrowserBucketPolicy(s3, bucket);
      setPolicyState({ status: 'loaded', ...result });
    } catch (error) {
      setPolicyState({
        status: 'error',
        error: describeBrowserS3Error(error),
        accessDenied: isBrowserAccessDenied(error),
      });
    }
  };

  const columns: ColumnDef<BrowserObjectRow>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original;
        if (item.kind === 'folder') {
          const params = new URLSearchParams();
          params.set('prefix', item.fullPath);
          return (
            <Link
              href={`?${params.toString()}`}
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Folder className="h-4 w-4" />
              <span>{item.name}/</span>
            </Link>
          );
        }
        return (
          <Link
            href={directObjectPath(bucket, item.fullPath)}
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <FileText className="h-4 w-4" />
            <span>{item.name}</span>
          </Link>
        );
      },
      meta: { fieldType: 'string', visible: true, monospace: true },
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ row }) => {
        const item = row.original;
        return item.kind === 'object' && item.size !== null
          ? bytes(item.size, { unitSeparator: ' ' })
          : '-';
      },
      meta: { fieldType: 'number', visible: true },
    },
    {
      accessorKey: 'lastModified',
      header: 'Last Modified',
      cell: ({ row }) =>
        row.original.kind === 'object'
          ? row.original.lastModified ?? '-'
          : '-',
      meta: { fieldType: 'date', visible: true },
    },
    {
      accessorKey: 'storageClass',
      header: 'Storage Class',
      cell: ({ row }) =>
        row.original.kind === 'object'
          ? row.original.storageClass ?? '-'
          : '-',
      meta: { fieldType: 'string', visible: false },
    },
    {
      accessorKey: 'etag',
      header: 'ETag',
      cell: ({ row }) =>
        row.original.kind === 'object' ? row.original.etag ?? '-' : '-',
      meta: { fieldType: 'string', visible: false, monospace: true },
    },
    {
      id: 'objectActions',
      header: 'Actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-1">
            {item.kind === 'object' && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="Download"
                disabled={downloadBusy}
                onClick={() => void downloadRows([item])}
              >
                <Download className="h-4 w-4" />
                <span className="sr-only">Download</span>
              </Button>
            )}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title="Remove"
              onClick={() => openRemoveDialog([item])}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        );
      },
      meta: { fieldType: 'string', visible: true },
    },
  ];

  if (credsError) {
    return (
      <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
        Failed to obtain STS credentials: {credsError}
      </div>
    );
  }

  if (!s3) {
    return <div className="text-sm text-muted-foreground">Acquiring credentials</div>;
  }

  const directNotice = (
    <div className="rounded-md border border-blue-500/50 bg-blue-500/10 p-3 text-sm">
      <div className="font-medium">Direct browser mode</div>
      <div className="text-muted-foreground">
        S3 operations on this page go from your browser straight to{' '}
        <code>{endpoint || 'the S3 endpoint'}</code>. Ceph 20.2.3 requires CORS
        on this bucket; global RGW CORS may become available after a future
        Ceph 21.x or later upgrade.
      </div>
    </div>
  );

  if (inspectKey) {
    const parentSegments = inspectSegments.slice(0, -1);
    return (
      <div className="space-y-4">
        {directNotice}
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link
            href={`/object-storage/buckets/${encodeURIComponent(bucket)}/direct`}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" />
            <span>{bucket}</span>
          </Link>
          {parentSegments.map((segment, index) => {
            const upToHere = `${parentSegments.slice(0, index + 1).join('/')}/`;
            return (
              <span key={upToHere} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <Link
                  href={`/object-storage/buckets/${encodeURIComponent(
                    bucket
                  )}/direct?prefix=${encodeURIComponent(upToHere)}`}
                  className="hover:text-foreground"
                >
                  {segment}
                </Link>
              </span>
            );
          })}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{inspectedFileName}</span>
        </div>
        <div>
          <h2 className="mb-1 break-all text-xl font-semibold">
            {inspectedFileName}
          </h2>
          <p className="break-all font-mono text-sm text-muted-foreground">
            {inspectKey}
          </p>
        </div>
        {headQuery.isLoading && (
          <div className="text-sm text-muted-foreground">Loading metadata</div>
        )}
        {headQuery.error && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-destructive">
            {describeBrowserS3Error(headQuery.error)}
          </div>
        )}
        {inspectedMetadata && <ObjectMetadataDetails data={inspectedMetadata} />}
      </div>
    );
  }

  const removeDialogTarget = removeTargets[0];
  const removeDialogTitle =
    removeTargets.length === 1
      ? `Remove ${removeDialogTarget?.kind === 'folder' ? 'folder' : 'item'}?`
      : 'Remove selected?';
  const removeDialogDescription =
    removeTargets.length === 1
      ? removeDialogTarget?.kind === 'folder'
        ? 'This will remove this folder and all items inside it.'
        : 'This will remove this item.'
      : 'This will remove the selected items. Selected folders include all items inside them.';

  return (
    <div className="space-y-3">
      {directNotice}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link
            href={`/object-storage/buckets/${encodeURIComponent(bucket)}/direct`}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" />
            <span>{bucket}</span>
          </Link>
          {segments.map((segment, index) => {
            const upToHere = `${segments.slice(0, index + 1).join('/')}/`;
            return (
              <span key={upToHere} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <Link
                  href={`/object-storage/buckets/${encodeURIComponent(
                    bucket
                  )}/direct?prefix=${encodeURIComponent(upToHere)}`}
                  className="hover:text-foreground"
                >
                  {segment}
                </Link>
              </span>
            );
          })}
        </div>
        <Link
          href={`/object-storage/buckets/${encodeURIComponent(bucket)}${
            prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
          }`}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Server browser mode
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFilesSelected(event.currentTarget)}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFilesSelected(event.currentTarget)}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Files
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => folderInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Folder
        </Button>
        <UploadQueueMenu
          files={uploadFiles}
          disabled={uploading}
          onChange={setUploadFiles}
        />
        <Button
          type="button"
          size="sm"
          disabled={uploadFiles.length === 0 || uploading}
          onClick={() => void handleUpload()}
        >
          <Upload className="h-4 w-4" />
          {uploading
            ? uploadProgress === null
              ? 'Uploading'
              : `Uploading ${uploadProgress}%`
            : 'Upload'}
        </Button>

        <div className="h-6 w-px bg-border" />

        <Input
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleCreateFolder();
            }
          }}
          placeholder="Folder name"
          className="w-48"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!folderName.trim() || folderBusy}
          onClick={() => void handleCreateFolder()}
        >
          <Folder className="h-4 w-4" />
          Create
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void openPolicy()}
        >
          <ShieldCheck className="h-4 w-4" />
          Bucket policy
        </Button>
      </div>

      {(uploadMessage ||
        uploadError ||
        folderMessage ||
        folderError ||
        removeMessage ||
        removeError ||
        downloadMessage ||
        downloadError) && (
        <div className="space-y-1 text-sm">
          {uploadMessage && <div className="text-muted-foreground">{uploadMessage}</div>}
          {folderMessage && <div className="text-muted-foreground">{folderMessage}</div>}
          {removeMessage && <div className="text-muted-foreground">{removeMessage}</div>}
          {downloadMessage && <div className="text-muted-foreground">{downloadMessage}</div>}
          {uploadError && <div className="text-destructive">{uploadError}</div>}
          {folderError && <div className="text-destructive">{folderError}</div>}
          {removeError && <div className="text-destructive">{removeError}</div>}
          {downloadError && <div className="text-destructive">{downloadError}</div>}
        </div>
      )}

      {(sizeResult || sizeError) && (
        <div className="rounded-md border p-3 text-sm">
          {sizeResult && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{sizeResult.label}</span>
              <Badge variant="secondary">
                {bytes(sizeResult.totalBytes, { unitSeparator: ' ' })}
              </Badge>
              <span className="text-muted-foreground">
                {sizeResult.totalBytes} bytes across {sizeResult.objectCount}{' '}
                {sizeResult.objectCount === 1 ? 'object' : 'objects'}
                {sizeResult.folderCount > 0
                  ? ` in ${sizeResult.folderCount} ${
                      sizeResult.folderCount === 1 ? 'folder' : 'folders'
                    }`
                  : ''}
              </span>
            </div>
          )}
          {sizeError && <div className="text-destructive">{sizeError}</div>}
        </div>
      )}

      {listQuery.isLoading && (
        <div className="text-sm text-muted-foreground">Loading objects</div>
      )}
      <DataTable
        columns={columns}
        data={rows}
        refetch={listQuery.refetch}
        isRefetching={listQuery.isRefetching}
        resourceName="object"
        emptyIcon={Folder}
        rowActions={[
          {
            label: downloadBusy ? 'Preparing downloads' : 'Download selected',
            icon: Download,
            onClick: (selectedRows) => void downloadRows(selectedRows),
          },
          {
            label: 'Remove selected',
            variant: 'destructive',
            icon: Trash2,
            onClick: openRemoveDialog,
          },
          {
            label: sizeBusy ? 'Calculating size' : 'Calculate size',
            icon: Calculator,
            onClick: (selectedRows) => void calculateRows(selectedRows),
          },
        ]}
      />

      {listQuery.error && (
        <div
          className={`rounded-md border p-3 text-sm flex gap-2 ${
            isBrowserAccessDenied(listQuery.error)
              ? 'border-yellow-500/50 bg-yellow-500/10'
              : 'border-red-500/50 bg-red-500/10'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">
              {isBrowserAccessDenied(listQuery.error)
                ? 'Access denied'
                : 'Unable to list objects'}
            </div>
            <div className="text-muted-foreground">
              {describeBrowserS3Error(listQuery.error)}
            </div>
            {!isBrowserAccessDenied(listQuery.error) && (
              <div className="mt-1 text-muted-foreground">
                If this is a CORS error, inspect the request in browser DevTools.
              </div>
            )}
          </div>
        </div>
      )}

      {listQuery.data?.isTruncated && (
        <p className="text-sm text-muted-foreground">
          Listing truncated at 1000 entries. Pagination not yet implemented.
        </p>
      )}

      <Dialog
        open={overwriteOpen}
        onOpenChange={(open) => {
          if (!uploading) setOverwriteOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite existing objects?</DialogTitle>
            <DialogDescription>
              These direct upload targets already exist or repeat in the upload
              queue. Confirm before replacing them.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-auto rounded-md border p-3 text-sm">
            {overwriteKeys.slice(0, 10).map((key) => (
              <div key={key} className="break-all font-mono text-xs">
                {key}
              </div>
            ))}
            {overwriteKeys.length > 10 && (
              <div className="mt-2 text-muted-foreground">
                and {overwriteKeys.length - 10} more
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => setOverwriteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={uploading}
              onClick={() => void handleUpload(true)}
            >
              <Upload className="h-4 w-4" />
              {uploading
                ? uploadProgress === null
                  ? 'Uploading'
                  : `Uploading ${uploadProgress}%`
                : 'Overwrite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!removing) setRemoveOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{removeDialogTitle}</DialogTitle>
            <DialogDescription>{removeDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-auto rounded-md border p-3 text-sm">
            {removeTargets.slice(0, 10).map((target) => (
              <div key={target.fullPath} className="flex gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">
                  {target.kind === 'folder' ? 'Folder' : 'Item'}
                </span>
                <span className="break-all font-mono">{target.fullPath}</span>
              </div>
            ))}
            {removeTargets.length > 10 && (
              <div className="mt-2 text-muted-foreground">
                and {removeTargets.length - 10} more
              </div>
            )}
          </div>
          {removeError && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-destructive">
              {removeError}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={removing}
              onClick={() => setRemoveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removing}
              onClick={() => void confirmRemove()}
            >
              <Trash2 className="h-4 w-4" />
              {removing ? 'Removing' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Download selected objects</DialogTitle>
            <DialogDescription>
              Browsers may block pages that start several downloads at once.
              Start each direct RGW download explicitly below.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-auto rounded-md border p-2">
            {downloadQueue.map((download) => {
              const started = startedDownloads.has(download.key);
              return (
                <div
                  key={download.key}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-sm px-2 py-1.5"
                >
                  <span
                    className="min-w-0 truncate font-mono text-xs"
                    title={download.key}
                  >
                    {download.key}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={download.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        setStartedDownloads((current) => {
                          const next = new Set(current);
                          next.add(download.key);
                          return next;
                        })
                      }
                    >
                      <Download className="h-4 w-4" />
                      {started ? 'Download again' : 'Download'}
                    </a>
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDownloadOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bucket policy</DialogTitle>
            <DialogDescription>{bucket}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <div className="text-sm font-medium">Bucket ARN</div>
            <div className="break-all font-mono text-sm text-muted-foreground">
              {policyState.status === 'loading'
                ? 'Loading ARN'
                : policyState.status === 'loaded'
                  ? policyState.bucketArn
                  : 'Unavailable'}
            </div>
          </div>
          {policyState.status === 'loading' && (
            <div className="text-sm text-muted-foreground">Loading policy</div>
          )}
          {policyState.status === 'loaded' &&
            (policyState.policy ? (
              <Textarea
                readOnly
                value={policyState.policy}
                className="h-[420px] font-mono text-xs"
              />
            ) : (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                No bucket policy is configured.
              </div>
            ))}
          {policyState.status === 'error' && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
              <div className="font-medium">
                {policyState.accessDenied ? 'Access denied' : 'Policy check failed'}
              </div>
              <div className="mt-1 break-all font-mono text-xs">
                {policyState.error}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
