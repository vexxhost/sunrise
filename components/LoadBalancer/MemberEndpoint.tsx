import {
  formatOctaviaMemberAddress,
  formatOctaviaMemberMonitor,
} from "@/lib/openstack/octavia-pool-settings";
import type { OctaviaMember } from "@/types/openstack";

export function MemberEndpoint({ member }: { member: OctaviaMember }) {
  const monitor = formatOctaviaMemberMonitor(member);
  return (
    <>
      <span className="font-mono">{formatOctaviaMemberAddress(member)}</span>
      {monitor ? (
        <p className="mt-1 whitespace-normal text-xs text-muted-foreground">
          Health check:{" "}
          <span className="wrap-anywhere font-mono">{monitor}</span>
        </p>
      ) : null}
    </>
  );
}
