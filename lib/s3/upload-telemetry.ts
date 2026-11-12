"use server";

import { z } from "zod";
import { observeS3Upload } from "@/lib/metrics";
import { getSession } from "@/lib/session";

const uploadMetric = z.object({
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  durationSeconds: z.number().min(0).max(24 * 60 * 60),
  mode: z.enum(["proxy", "direct"]),
  outcome: z.enum(["success", "error", "cancelled"]),
  parts: z.number().int().min(0).max(10_000),
  strategy: z.enum(["single", "multipart"]),
});

export type S3UploadMetric = z.infer<typeof uploadMetric>;

export async function recordS3UploadMetrics(entries: S3UploadMetric[]) {
  const parsed = z.array(uploadMetric).max(1000).safeParse(entries);
  if (!parsed.success) return;
  const session = await getSession();
  if (!session.projectId) return;
  for (const entry of parsed.data) observeS3Upload(entry);
}
