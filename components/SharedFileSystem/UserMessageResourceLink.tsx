import { ResourceLink } from "@/components/resources/ResourceLink";
import type { ManilaUserMessage } from "@/types/openstack";

const resourceTypeLabels: Record<string, string> = {
  SECURITY_SERVICE: "Security service",
  SHARE: "Share",
  SHARE_GROUP: "Share group",
  SHARE_NETWORK: "Share network",
  SHARE_NETWORK_SUBNET: "Share network subnet",
  SHARE_REPLICA: "Share replica",
  SHARE_SNAPSHOT: "Share snapshot",
};

const resourceTypePaths: Partial<Record<string, string>> = {
  SECURITY_SERVICE: "/shared-file-systems/security-services",
  SHARE: "/shared-file-systems/shares",
  SHARE_NETWORK: "/shared-file-systems/share-networks",
  SHARE_SNAPSHOT: "/shared-file-systems/snapshots",
};

export function formatUserMessageResourceType(
  resourceType: string | null | undefined,
) {
  if (!resourceType) return "Unknown resource";
  return (
    resourceTypeLabels[resourceType] ??
    resourceType
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function userMessageResourceHref({
  resource_id: resourceId,
  resource_type: resourceType,
}: Pick<ManilaUserMessage, "resource_id" | "resource_type">) {
  const path = resourceType ? resourceTypePaths[resourceType] : undefined;
  return path && resourceId
    ? `${path}/${encodeURIComponent(resourceId)}`
    : undefined;
}

export function UserMessageResourceLink({
  message,
}: {
  message: Pick<ManilaUserMessage, "resource_id" | "resource_type">;
}) {
  if (!message.resource_id) return <span>-</span>;
  const href = userMessageResourceHref(message);
  return href ? (
    <ResourceLink href={href} className="font-mono text-xs">
      {message.resource_id}
    </ResourceLink>
  ) : (
    <span className="font-mono text-xs">{message.resource_id}</span>
  );
}
