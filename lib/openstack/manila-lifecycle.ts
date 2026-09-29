import type { ManilaShare } from "@/types/openstack";

const STABLE_SHARE_STATUSES = new Set(["available", "error", "inactive"]);
const DELETABLE_SHARE_STATUSES = new Set(["available", "error", "inactive"]);

export function normalizeManilaStatus(status: string | null | undefined) {
  return (status ?? "unknown").trim().toLowerCase();
}

export function formatManilaStatus(status: string | null | undefined) {
  return normalizeManilaStatus(status)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isShareTransitioning(share: Pick<ManilaShare, "status">) {
  const status = normalizeManilaStatus(share.status);
  return !STABLE_SHARE_STATUSES.has(status) && !status.endsWith("_error");
}

export function canEditShare(share: Pick<ManilaShare, "status">) {
  return normalizeManilaStatus(share.status) === "available";
}

export function canResizeShare(share: Pick<ManilaShare, "status">) {
  return normalizeManilaStatus(share.status) === "available";
}

export function canManageShareAccess(share: Pick<ManilaShare, "status">) {
  return normalizeManilaStatus(share.status) === "available";
}

export function canDeleteShare(share: Pick<ManilaShare, "status">) {
  return DELETABLE_SHARE_STATUSES.has(normalizeManilaStatus(share.status));
}

export function shareStatusVariant(status: string) {
  const normalized = normalizeManilaStatus(status);
  if (normalized.includes("error")) return "destructive" as const;
  if (normalized === "available") return "default" as const;
  if (normalized === "inactive") return "secondary" as const;
  return "outline" as const;
}
