import { ResourceLink } from "@/components/resources/ResourceLink";
import {
  barbicanReferenceKey,
  type BarbicanReferenceNames,
} from "@/lib/openstack/barbican-references";
import { parseOctaviaBarbicanReference } from "@/lib/openstack/octavia-listener-settings";
import { cn } from "@/lib/utils";

export function OctaviaBarbicanReference({
  reference,
  name,
  names,
  alternate,
  missing = "None",
  external = "External certificate reference",
  newTab = false,
  className,
}: {
  reference?: string | null;
  name?: string | null;
  names?: BarbicanReferenceNames;
  alternate?: string;
  missing?: string;
  external?: string;
  newTab?: boolean;
  className?: string;
}) {
  const parsed = parseOctaviaBarbicanReference(reference);
  if (!parsed) {
    return reference ? external : reference === null ? missing : "Not reported";
  }
  const label =
    parsed.collection === "secrets" ? "Open secret" : "Open container";
  const resourceName = names?.[barbicanReferenceKey(parsed)] || name?.trim();
  return (
    <ResourceLink
      href={`/key-manager/${parsed.collection}/${parsed.id}`}
      prefetch={false}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener" : undefined}
      className={cn("wrap-anywhere", className)}
    >
      {resourceName || alternate || label}
    </ResourceLink>
  );
}
