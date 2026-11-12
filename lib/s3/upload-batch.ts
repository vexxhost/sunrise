export type S3UploadFileState =
  "pending" | "uploading" | "complete" | "failed" | "cancelled";

export interface S3UploadFile {
  file: File;
  key: string;
}

export interface S3UploadFileProgress {
  durationSeconds: number;
  index: number;
  key: string;
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
  state: S3UploadFileState;
}

export interface S3UploadProgress {
  batchPercentage: number;
  bytesPerSecond: number;
  files: S3UploadFileProgress[];
}

export interface S3UploadBatchResult {
  uploaded: number;
  errors: { key: string; error: string }[];
  cancelled: boolean;
}

type UploadFile = (
  item: S3UploadFile,
  onProgress: (loadedBytes: number) => void,
  signal: AbortSignal,
) => Promise<void>;

export function uploadAbortError() {
  const error = new Error("Upload cancelled");
  error.name = "AbortError";
  return error;
}

export function isUploadAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function throwIfUploadAborted(signal: AbortSignal) {
  if (signal.aborted) throw uploadAbortError();
}

function percentage(loaded: number, total: number) {
  if (total <= 0) return loaded > 0 ? 100 : 0;
  return Math.min(100, Math.round((loaded / total) * 100));
}

export async function runS3UploadBatch(
  items: S3UploadFile[],
  uploadFile: UploadFile,
  describeError: (error: unknown) => string,
  onProgress: (progress: S3UploadProgress) => void,
  signal: AbortSignal,
  shouldStop?: (error: unknown) => boolean,
): Promise<S3UploadBatchResult> {
  const states: S3UploadFileProgress[] = items.map((item, index) => ({
    index,
    durationSeconds: 0,
    key: item.key,
    loadedBytes: 0,
    totalBytes: item.file.size,
    percentage: 0,
    state: "pending",
  }));
  const totalBytes = items.reduce((total, item) => total + item.file.size, 0);
  const errors: { key: string; error: string }[] = [];
  const speedSamples = [{ at: performance.now(), loadedBytes: 0 }];
  let uploaded = 0;

  const emit = () => {
    const now = performance.now();
    const loadedBytes = states.reduce(
      (total, state) => total + state.loadedBytes,
      0,
    );
    const latestSample = speedSamples.at(-1)!;
    if (
      latestSample.loadedBytes !== loadedBytes ||
      now - latestSample.at >= 500
    ) {
      speedSamples.push({ at: now, loadedBytes });
    }
    const cutoff = now - 3000;
    while (speedSamples.length > 2 && speedSamples[1].at < cutoff) {
      speedSamples.shift();
    }
    const firstSample = speedSamples[0];
    const elapsedSeconds = (now - firstSample.at) / 1000;
    const bytesPerSecond =
      elapsedSeconds > 0
        ? Math.max(0, loadedBytes - firstSample.loadedBytes) / elapsedSeconds
        : 0;
    const completeFiles = states.filter(
      (state) => state.state === "complete",
    ).length;
    onProgress({
      batchPercentage:
        totalBytes > 0
          ? percentage(loadedBytes, totalBytes)
          : percentage(completeFiles, items.length),
      bytesPerSecond,
      files: states.map((state) => ({ ...state })),
    });
  };

  emit();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const state = states[index];
    const startedAt = performance.now();
    try {
      throwIfUploadAborted(signal);
      state.state = "uploading";
      emit();
      await uploadFile(
        item,
        (loadedBytes) => {
          state.loadedBytes = Math.min(
            item.file.size,
            Math.max(0, loadedBytes),
          );
          state.percentage = percentage(state.loadedBytes, item.file.size);
          emit();
        },
        signal,
      );
      state.loadedBytes = item.file.size;
      state.percentage = 100;
      state.state = "complete";
      state.durationSeconds = Math.max(0, performance.now() - startedAt) / 1000;
      uploaded += 1;
      emit();
    } catch (error) {
      if (isUploadAbortError(error) || signal.aborted) {
        state.state = "cancelled";
        state.durationSeconds =
          Math.max(0, performance.now() - startedAt) / 1000;
        for (const pending of states.slice(index + 1)) {
          pending.state = "cancelled";
        }
        emit();
        return { uploaded, errors, cancelled: true };
      }
      if (shouldStop?.(error)) throw error;
      state.state = "failed";
      state.durationSeconds = Math.max(0, performance.now() - startedAt) / 1000;
      errors.push({ key: item.key, error: describeError(error) });
      emit();
    }
  }

  return { uploaded, errors, cancelled: false };
}
