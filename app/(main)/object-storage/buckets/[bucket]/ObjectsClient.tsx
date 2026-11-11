"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Calculator,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Home,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import bytes from "bytes";
import { DataTable } from "@/components/DataTable";
import { MutationConfirmationDialog } from "@/components/mutations/MutationConfirmationDialog";
import { BucketSettingsDialog } from "@/components/object-storage/BucketSettingsDialog";
import { ResourceLink } from "@/components/resources/ResourceLink";
import { UploadQueueMenu } from "@/components/UploadQueueMenu";
import { UploadSpeedIndicator } from "@/components/UploadSpeedIndicator";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { objectsQueryOptions } from "@/hooks/queries/useObjects";
import { useMutationRefresh } from "@/hooks/useMutationRefresh";
import {
  calculateSelectionSize,
  createFolder,
  type ListObjectsResult,
  removeSelection,
  type CalculateSelectionSizeResult,
  type RemoveSelectionEntry,
  type RemoveSelectionResult,
  type SizeSelectionEntry,
} from "@/lib/s3/actions";
import { startObjectStorageCredentialRefresh } from "@/lib/s3/auth-navigation";
import {
  findProxyUploadConflicts,
  ProxyS3AuthRequiredError,
  uploadProxyFiles,
} from "@/lib/s3/proxy-upload";
import type { S3UploadProgress } from "@/lib/s3/upload-batch";
import { buildS3UploadMetrics } from "@/lib/s3/upload-telemetry-client";
import { recordS3UploadMetrics } from "@/lib/s3/upload-telemetry";

type Row =
  | { kind: "folder"; name: string; fullPath: string }
  | {
      kind: "object";
      name: string;
      fullPath: string;
      size: number | null;
      lastModified: string | null;
      storageClass: string | null;
      etag: string | null;
    };

type SizeState = Extract<CalculateSelectionSizeResult, { ok: true }> & {
  label: string;
};

function basenameOf(prefix: string, key: string) {
  const tail = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  return tail.replace(/\/$/, "");
}

function downloadUrl(bucket: string, key: string) {
  return `/object-storage/buckets/${encodeURIComponent(
    bucket,
  )}/download?key=${encodeURIComponent(key)}`;
}

function filePath(file: File) {
  return (
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name
  );
}

function selectionFor(rows: Row[]): SizeSelectionEntry[] {
  return rows.map((row) => {
    if (row.kind === "folder") {
      return { kind: "folder", fullPath: row.fullPath };
    }
    return { kind: "object", fullPath: row.fullPath, size: row.size };
  });
}

function removalFor(rows: Row[]): RemoveSelectionEntry[] {
  return rows.map((row) => {
    if (row.kind === "folder") {
      return { kind: "folder", fullPath: row.fullPath };
    }
    return { kind: "object", fullPath: row.fullPath };
  });
}

function downloadSelection(bucket: string, rows: Row[]) {
  if (rows.length === 0) return;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/object-storage/buckets/${encodeURIComponent(
    bucket,
  )}/download-selected`;
  form.style.display = "none";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "entries";
  input.value = JSON.stringify(
    rows.map((row) => ({ kind: row.kind, fullPath: row.fullPath })),
  );

  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

interface ObjectsClientProps {
  activeProjectId: string;
  activeRegionId: string;
  bucket: string;
  initialPrefix: string;
  initialData: Extract<ListObjectsResult, { ok: true }>;
}

export function ObjectsClient({
  activeProjectId,
  activeRegionId,
  bucket,
  initialPrefix,
  initialData,
}: ObjectsClientProps) {
  const searchParams = useSearchParams();
  const prefix = searchParams.get("prefix") ?? "";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const objectListOptions = useMemo(
    () => objectsQueryOptions(activeProjectId, bucket, prefix),
    [activeProjectId, bucket, prefix],
  );

  const {
    data = initialData,
    refetch,
    isRefetching,
  } = useQuery({
    ...objectListOptions,
    initialData: prefix === initialPrefix ? initialData : undefined,
  });
  const refreshObjects = useMutationRefresh(objectListOptions.queryKey);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<S3UploadProgress | null>(
    null,
  );
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [overwriteKeys, setOverwriteKeys] = useState<string[]>([]);
  const [folderName, setFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeTargets, setRemoveTargets] = useState<Row[]>([]);
  const [removing, setRemoving] = useState(false);
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [sizeBusy, setSizeBusy] = useState(false);
  const [sizeResult, setSizeResult] = useState<SizeState | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  useEffect(
    () => () => {
      uploadAbortRef.current?.abort();
    },
    [],
  );

  const rows: Row[] = useMemo(
    () => [
      ...data.folders.map<Row>((f) => ({
        kind: "folder",
        name: basenameOf(prefix, f.prefix),
        fullPath: f.prefix,
      })),
      ...data.objects.map<Row>((o) => ({
        kind: "object",
        name: basenameOf(prefix, o.key),
        fullPath: o.key,
        size: o.size,
        lastModified: o.lastModified,
        storageClass: o.storageClass,
        etag: o.etag,
      })),
    ],
    [data.folders, data.objects, prefix],
  );

  const handleFilesSelected = (input: HTMLInputElement) => {
    const selectedFiles = input.files ? Array.from(input.files) : [];
    if (selectedFiles.length > 0) {
      setUploadFiles((currentFiles) => [...currentFiles, ...selectedFiles]);
    }
    input.value = "";
    setUploadMessage(null);
    setUploadError(null);
    setUploadProgress(null);
    setOverwriteOpen(false);
    setOverwriteKeys([]);
  };

  const handleUpload = async (confirmOverwrite = false) => {
    if (uploadFiles.length === 0 || uploading) return;
    setUploading(true);
    setUploadProgress(null);
    setUploadMessage(null);
    setUploadError(null);
    if (confirmOverwrite) setOverwriteOpen(false);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const progressSnapshot: { current: S3UploadProgress | null } = {
      current: null,
    };
    const files = uploadFiles.map((file) => ({
      file,
      key: `${prefix}${filePath(file)}`,
    }));

    try {
      if (!confirmOverwrite) {
        const conflicts = await findProxyUploadConflicts(
          activeProjectId,
          bucket,
          files.map(({ key }) => key),
          controller.signal,
        );
        if (conflicts.length > 0) {
          setOverwriteKeys(conflicts);
          setOverwriteOpen(true);
          return;
        }
      }

      const result = await uploadProxyFiles(
        activeProjectId,
        bucket,
        files,
        (progress) => {
          progressSnapshot.current = progress;
          setUploadProgress(progress);
        },
        controller.signal,
      );
      void recordS3UploadMetrics(
        buildS3UploadMetrics("proxy", files, progressSnapshot.current),
      ).catch(() => undefined);
      setUploadMessage(
        result.cancelled
          ? "Upload cancelled. Completed objects were preserved."
          : `Uploaded ${result.uploaded} ${result.uploaded === 1 ? "object" : "objects"}.`,
      );
      if (result.errors.length > 0) {
        setUploadError(
          `${result.errors.length} upload failed. ${result.errors[0].key}: ${result.errors[0].error}`,
        );
      }
      setUploadFiles(
        progressSnapshot.current
          ? progressSnapshot.current.files
              .filter((progress) => progress.state !== "complete")
              .map((progress) => uploadFiles[progress.index])
          : uploadFiles,
      );
      if (result.uploaded > 0) await refreshObjects();
    } catch (error) {
      if (error instanceof ProxyS3AuthRequiredError) {
        startObjectStorageCredentialRefresh();
      } else if (controller.signal.aborted) {
        setUploadMessage("Upload cancelled.");
      } else {
        setUploadError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim() || folderBusy) return;
    setFolderBusy(true);
    setFolderMessage(null);
    setFolderError(null);

    const result = await createFolder(
      activeProjectId,
      bucket,
      prefix,
      folderName,
    );
    setFolderBusy(false);

    if (!result.ok) {
      if (result.needsAuth) {
        startObjectStorageCredentialRefresh();
        return;
      }
      setFolderError(result.error);
      return;
    }

    setFolderName("");
    setFolderMessage(`Created ${result.key}`);
    await refreshObjects();
  };

  const openRemoveDialog = (targets: Row[]) => {
    if (targets.length === 0) return;
    setRemoveTargets(targets);
    setRemoveError(null);
    setRemoveMessage(null);
    setRemoveOpen(true);
  };

  const confirmRemove = async () => {
    if (removeTargets.length === 0 || removing) return;
    setRemoving(true);
    setRemoveError(null);
    setRemoveMessage(null);

    const result: RemoveSelectionResult = await removeSelection(
      activeProjectId,
      bucket,
      removalFor(removeTargets),
    );
    setRemoving(false);

    if (!result.ok) {
      if (result.needsAuth) {
        startObjectStorageCredentialRefresh();
        return;
      }
      setRemoveError(result.error);
      return;
    }

    setRemoveOpen(false);
    setRemoveTargets([]);
    setRemoveMessage(
      `Removed ${result.deleted} ${result.deleted === 1 ? "object" : "objects"}.`,
    );
    if (result.errors.length > 0) {
      setRemoveError(
        `${result.errors.length} delete failed. ${result.errors[0].key}: ${result.errors[0].error}`,
      );
    }
    await refreshObjects();
  };

  const calculateRows = async (selectedRows: Row[]) => {
    if (selectedRows.length === 0 || sizeBusy) return;
    setSizeBusy(true);
    setSizeResult(null);
    setSizeError(null);

    const result = await calculateSelectionSize(
      bucket,
      selectionFor(selectedRows),
    );
    setSizeBusy(false);

    if (!result.ok) {
      if (result.needsAuth) {
        startObjectStorageCredentialRefresh();
        return;
      }
      setSizeError(result.error);
      return;
    }

    setSizeResult({
      ...result,
      label:
        selectedRows.length === 1
          ? selectedRows[0].name
          : `${selectedRows.length} selected items`,
    });
  };

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: "name",
      header: "Name",
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "folder") {
          const params = new URLSearchParams();
          params.set("prefix", r.fullPath);
          return (
            <ResourceLink
              href={`?${params.toString()}`}
              className="flex items-center gap-2"
            >
              <Folder className="h-4 w-4" />
              <span>{r.name}/</span>
            </ResourceLink>
          );
        }
        return (
          <ResourceLink
            href={`/object-storage/buckets/${encodeURIComponent(
              bucket,
            )}/object/${encodeURIComponent(r.fullPath)}`}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            <span>{r.name}</span>
          </ResourceLink>
        );
      },
      meta: { fieldType: "string", visible: true },
    },
    {
      accessorKey: "size",
      header: "Size",
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "folder" || r.size === null) return "-";
        return bytes(r.size, { unitSeparator: " " });
      },
      meta: { fieldType: "number", visible: true },
    },
    {
      accessorKey: "lastModified",
      header: "Last Modified",
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "folder") return "-";
        return r.lastModified ?? "-";
      },
      meta: { fieldType: "date", visible: true },
    },
    {
      accessorKey: "storageClass",
      header: "Storage Class",
      cell: ({ row }) => {
        const r = row.original;
        return r.kind === "object" ? (r.storageClass ?? "-") : "-";
      },
      meta: { fieldType: "string", visible: false },
    },
    {
      accessorKey: "etag",
      header: "ETag",
      cell: ({ row }) => {
        const r = row.original;
        return r.kind === "object" ? (r.etag ?? "-") : "-";
      },
      meta: { fieldType: "string", visible: false, monospace: true },
    },
    {
      id: "objectActions",
      header: "Actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-1">
            {r.kind === "object" && (
              <a
                className={buttonVariants({
                  size: "icon-sm",
                  variant: "ghost",
                })}
                href={downloadUrl(bucket, r.fullPath)}
                title="Download"
              >
                <Download className="h-4 w-4" />
                <span className="sr-only">Download</span>
              </a>
            )}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Remove"
              onClick={() => openRemoveDialog([r])}
              tone="danger"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        );
      },
      meta: { fieldType: "string", visible: true },
    },
  ];

  const segments = prefix
    .replace(/\/$/, "")
    .split("/")
    .filter((s) => s.length > 0);
  const removeDialogTarget = removeTargets[0];
  const removeDialogTitle =
    removeTargets.length === 1
      ? `Remove ${removeDialogTarget?.kind === "folder" ? "folder" : "item"}?`
      : "Remove selected?";
  const removeDialogDescription =
    removeTargets.length === 1
      ? removeDialogTarget?.kind === "folder"
        ? "This will remove this folder and all items inside it."
        : "This will remove this item."
      : "This will remove the selected items. Selected folders include all items inside them.";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <Link
            href={`/object-storage/buckets/${encodeURIComponent(bucket)}`}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" />
            <span>{bucket}</span>
          </Link>
          {segments.map((seg, idx) => {
            const upToHere = segments.slice(0, idx + 1).join("/") + "/";
            return (
              <span key={idx} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <Link
                  href={`/object-storage/buckets/${encodeURIComponent(
                    bucket,
                  )}?prefix=${encodeURIComponent(upToHere)}`}
                  className="hover:text-foreground"
                >
                  {seg}
                </Link>
              </span>
            );
          })}
        </div>
        <Link
          href={`/object-storage/buckets/${encodeURIComponent(bucket)}/direct${
            prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""
          }`}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          Direct browser mode
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
          {...({ webkitdirectory: "", directory: "" } as Record<
            string,
            string
          >)}
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
          progress={uploadProgress}
          onChange={setUploadFiles}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void handleUpload();
          }}
          disabled={uploadFiles.length === 0}
          loading={uploading}
        >
          <Upload className="h-4 w-4" />
          {uploading
            ? `Uploading ${uploadProgress?.batchPercentage ?? 0}%`
            : "Upload"}
        </Button>
        {uploading ? <UploadSpeedIndicator progress={uploadProgress} /> : null}
        {uploading ? (
          <Button
            type="button"
            variant="outline"
            tone="danger"
            size="sm"
            onClick={() => uploadAbortRef.current?.abort()}
          >
            <X className="h-4 w-4" />
            Cancel upload
          </Button>
        ) : null}

        <div className="h-6 w-px bg-border" />

        <Input
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
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
          onClick={() => {
            void handleCreateFolder();
          }}
          disabled={!folderName.trim() || folderBusy}
        >
          <Folder className="h-4 w-4" />
          Create
        </Button>

        <div className="h-6 w-px bg-border" />

        <BucketSettingsDialog
          bucket={bucket}
          scope={{ projectId: activeProjectId, regionId: activeRegionId }}
        />
      </div>

      {(uploadMessage ||
        uploadError ||
        folderMessage ||
        folderError ||
        removeMessage ||
        removeError) && (
        <div className="space-y-1 text-sm">
          {uploadMessage && (
            <div className="text-muted-foreground">{uploadMessage}</div>
          )}
          {folderMessage && (
            <div className="text-muted-foreground">{folderMessage}</div>
          )}
          {removeMessage && (
            <div className="text-muted-foreground">{removeMessage}</div>
          )}
          {uploadError && <div className="text-destructive">{uploadError}</div>}
          {folderError && <div className="text-destructive">{folderError}</div>}
          {removeError && <div className="text-destructive">{removeError}</div>}
        </div>
      )}

      {(sizeResult || sizeError) && (
        <div className="rounded-md border p-3 text-sm">
          {sizeResult && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{sizeResult.label}</span>
              <Badge variant="secondary">
                {bytes(sizeResult.totalBytes, { unitSeparator: " " })}
              </Badge>
              <span className="text-muted-foreground">
                {sizeResult.totalBytes} bytes across {sizeResult.objectCount}{" "}
                {sizeResult.objectCount === 1 ? "object" : "objects"}
                {sizeResult.folderCount > 0
                  ? ` in ${sizeResult.folderCount} ${
                      sizeResult.folderCount === 1 ? "folder" : "folders"
                    }`
                  : ""}
              </span>
            </div>
          )}
          {sizeError && <div className="text-destructive">{sizeError}</div>}
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        refetch={refetch}
        isRefetching={isRefetching}
        resourceName="object"
        emptyIcon={Folder}
        getRowId={(row) => `${row.kind}:${row.fullPath}`}
        rowActions={[
          {
            label: "Download selected",
            icon: Download,
            onClick: (selectedRows) => {
              downloadSelection(bucket, selectedRows);
            },
          },
          {
            label: "Remove selected",
            variant: "destructive",
            icon: Trash2,
            onClick: (selectedRows) => {
              openRemoveDialog(selectedRows);
            },
          },
          {
            label: sizeBusy ? "Calculating size" : "Calculate size",
            icon: Calculator,
            onClick: (selectedRows) => {
              void calculateRows(selectedRows);
            },
          },
        ]}
      />

      {data.accessDenied && (
        <div className="flex gap-2 rounded-md border border-status-warning-border bg-status-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
          <div>
            <div className="font-medium">Access denied</div>
            <div className="text-muted-foreground">
              Your role does not have permission to list objects in
              <code> {bucket}</code>
              {prefix ? (
                <>
                  {" "}
                  at prefix <code>{prefix}</code>
                </>
              ) : null}
              .
            </div>
          </div>
        </div>
      )}

      {data.isTruncated && (
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
              These upload targets already exist or repeat in the upload queue.
              Confirm before replacing them.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-auto rounded-md border p-3 text-sm">
            {overwriteKeys.slice(0, 10).map((key) => (
              <div key={key} className="font-mono text-xs break-all">
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
              onClick={() => {
                void handleUpload(true);
              }}
            >
              <Upload className="h-4 w-4" />
              {uploading
                ? `Uploading ${uploadProgress?.batchPercentage ?? 0}%`
                : "Overwrite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MutationConfirmationDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onConfirm={confirmRemove}
        pending={removing}
        title={removeDialogTitle}
        description={removeDialogDescription}
        confirmLabel="Remove"
        pendingLabel="Removing"
        error={removeError}
        variant="destructive"
      >
        <div className="max-h-64 overflow-auto rounded-md border p-3 text-sm">
          {removeTargets.slice(0, 10).map((target) => (
            <div key={target.fullPath} className="flex gap-2 text-xs">
              <span className="shrink-0 text-muted-foreground">
                {target.kind === "folder" ? "Folder" : "Item"}
              </span>
              <span className="font-mono break-all">{target.fullPath}</span>
            </div>
          ))}
          {removeTargets.length > 10 && (
            <div className="mt-2 text-muted-foreground">
              and {removeTargets.length - 10} more
            </div>
          )}
        </div>
      </MutationConfirmationDialog>
    </div>
  );
}
