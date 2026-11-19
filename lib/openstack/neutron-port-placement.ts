export const NEUTRON_PORT_NUMA_AFFINITY_POLICIES = [
  "required",
  "preferred",
  "legacy",
  "socket",
] as const;

export type NeutronPortNumaAffinityPolicy =
  (typeof NEUTRON_PORT_NUMA_AFFINITY_POLICIES)[number];

export function isNeutronPortNumaAffinityPolicy(
  value: string,
): value is NeutronPortNumaAffinityPolicy {
  return NEUTRON_PORT_NUMA_AFFINITY_POLICIES.some(
    (candidate) => candidate === value,
  );
}

export const NEUTRON_PORT_NUMA_AFFINITY_POLICY_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: NeutronPortNumaAffinityPolicy;
}> = [
  {
    value: "required",
    label: "Required",
    description:
      "Require the PCI device and instance CPUs on the same NUMA node",
  },
  {
    value: "preferred",
    label: "Preferred",
    description: "Prefer NUMA-local placement but allow another NUMA node",
  },
  {
    value: "legacy",
    label: "Legacy",
    description: "Require affinity when the device reports NUMA information",
  },
  {
    value: "socket",
    label: "Socket",
    description:
      "Require the PCI device and instance CPUs on the same CPU socket",
  },
];

export function neutronPortNumaAffinityPolicyLabel(
  value: string | null | undefined,
) {
  return (
    NEUTRON_PORT_NUMA_AFFINITY_POLICY_OPTIONS.find(
      (option) => option.value === value,
    )?.label ??
    value ??
    "Cloud default"
  );
}

export const NEUTRON_PORT_HARDWARE_OFFLOAD_TYPES = ["switchdev"] as const;

export type NeutronPortHardwareOffloadType =
  (typeof NEUTRON_PORT_HARDWARE_OFFLOAD_TYPES)[number];

export function isNeutronPortHardwareOffloadType(
  value: string,
): value is NeutronPortHardwareOffloadType {
  return NEUTRON_PORT_HARDWARE_OFFLOAD_TYPES.some(
    (candidate) => candidate === value,
  );
}

export function neutronPortHardwareOffloadTypeLabel(
  value: string | null | undefined,
) {
  if (value === "switchdev") return "Switchdev";
  return value || "None";
}
