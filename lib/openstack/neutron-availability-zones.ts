import type { NeutronAvailabilityZone } from "@/types/openstack";

export function parseNeutronAvailabilityZones(
  payload: unknown,
): NeutronAvailabilityZone[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const zones = (payload as { availability_zones?: unknown })
    .availability_zones;
  if (!Array.isArray(zones)) return [];

  const parsed: NeutronAvailabilityZone[] = [];
  for (const value of zones) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const zone = value as Record<string, unknown>;
    if (
      typeof zone.name !== "string" ||
      !zone.name.trim() ||
      typeof zone.resource !== "string" ||
      !zone.resource.trim() ||
      typeof zone.state !== "string" ||
      !zone.state.trim()
    ) {
      return [];
    }
    parsed.push({
      name: zone.name.trim(),
      resource: zone.resource.trim(),
      state: zone.state.trim(),
    });
  }
  return parsed;
}
