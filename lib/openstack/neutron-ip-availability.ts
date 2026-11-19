import type {
  NetworkIpAvailability,
  NetworkIpAvailabilityDetails,
  SubnetIpAvailability,
} from "@/types/openstack";

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Neutron ${label} response`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  field: string,
  label: string,
) {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Invalid Neutron ${label} response`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  label: string,
) {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Invalid Neutron ${label} response`);
  }
  return value;
}

function count(record: Record<string, unknown>, field: string, label: string) {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`Invalid Neutron ${label} response`);
  }
  return value;
}

function parseDetails(
  value: unknown,
  label: string,
): NetworkIpAvailabilityDetails | undefined {
  if (value === undefined) return undefined;
  const details = asRecord(value, label);
  return {
    total_ips_in_subnet: count(details, "total_ips_in_subnet", label),
    total_ips_in_allocation_pool: count(
      details,
      "total_ips_in_allocation_pool",
      label,
    ),
    used_ips_in_subnet: count(details, "used_ips_in_subnet", label),
    used_ips_in_allocation_pool: count(
      details,
      "used_ips_in_allocation_pool",
      label,
    ),
  };
}

function parseSubnet(value: unknown): SubnetIpAvailability {
  const subnet = asRecord(value, "subnet IP availability");
  const ipVersion = subnet.ip_version;
  if (ipVersion !== 4 && ipVersion !== 6) {
    throw new Error("Invalid Neutron subnet IP availability response");
  }
  return {
    subnet_id: requiredString(
      subnet,
      "subnet_id",
      "subnet IP availability",
    ),
    subnet_name: requiredString(
      subnet,
      "subnet_name",
      "subnet IP availability",
    ),
    ip_version: ipVersion,
    cidr: requiredString(subnet, "cidr", "subnet IP availability"),
    total_ips: count(subnet, "total_ips", "subnet IP availability"),
    used_ips: count(subnet, "used_ips", "subnet IP availability"),
    ip_availability_details: parseDetails(
      subnet.ip_availability_details,
      "subnet IP availability details",
    ),
  };
}

export function parseNetworkIpAvailability(
  payload: unknown,
  expectedNetworkId: string,
): NetworkIpAvailability {
  const root = asRecord(payload, "network IP availability");
  const availability = asRecord(
    root.network_ip_availability,
    "network IP availability",
  );
  const networkId = requiredString(
    availability,
    "network_id",
    "network IP availability",
  );
  if (networkId !== expectedNetworkId) {
    throw new Error("Neutron returned IP availability for another network");
  }
  if (!Array.isArray(availability.subnet_ip_availability)) {
    throw new Error("Invalid Neutron network IP availability response");
  }

  return {
    network_id: networkId,
    network_name: requiredString(
      availability,
      "network_name",
      "network IP availability",
    ),
    tenant_id: optionalString(
      availability,
      "tenant_id",
      "network IP availability",
    ),
    project_id: optionalString(
      availability,
      "project_id",
      "network IP availability",
    ),
    total_ips: count(
      availability,
      "total_ips",
      "network IP availability",
    ),
    used_ips: count(
      availability,
      "used_ips",
      "network IP availability",
    ),
    subnet_ip_availability: availability.subnet_ip_availability.map(
      parseSubnet,
    ),
    ip_availability_details: parseDetails(
      availability.ip_availability_details,
      "network IP availability details",
    ),
  };
}

export type IpCapacity = {
  available: number;
  total: number;
  used: number;
  usageExceedsCapacity: boolean;
};

export function ipCapacity(
  availability: Pick<
    NetworkIpAvailability | SubnetIpAvailability,
    "ip_availability_details" | "total_ips" | "used_ips"
  >,
): IpCapacity {
  const total =
    availability.ip_availability_details?.total_ips_in_allocation_pool ??
    availability.total_ips;
  const used =
    availability.ip_availability_details?.used_ips_in_allocation_pool ??
    availability.used_ips;
  return {
    available: Math.max(total - used, 0),
    total,
    used,
    usageExceedsCapacity: used > total,
  };
}

export function ipUsagePercentage({ total, used }: IpCapacity) {
  if (total === 0) return used === 0 ? 0 : 100;
  return Math.min((used / total) * 100, 100);
}

const countFormatter = new Intl.NumberFormat("en-US");

export function formatIpCount(value: number) {
  return `${Number.isSafeInteger(value) ? "" : "~"}${countFormatter.format(value)}`;
}
