import type { Flavor } from "@/types/openstack";

export function flavorTotalDiskGiB(flavor: Flavor) {
  return flavor.disk + (flavor["OS-FLV-EXT-DATA:ephemeral"] || 0);
}

export function formatFlavorRam(ramMiB: number) {
  return ramMiB >= 1024 && ramMiB % 1024 === 0
    ? `${ramMiB / 1024} GiB`
    : `${ramMiB} MiB`;
}

export function formatFlavorCapacity(flavor: Flavor) {
  return `${flavor.name} · ${flavor.vcpus} vCPU · ${formatFlavorRam(flavor.ram)} RAM · ${flavorTotalDiskGiB(flavor)} GiB disk`;
}
