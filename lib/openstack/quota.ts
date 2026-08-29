export type QuotaLevel = "normal" | "warning" | "critical" | "unlimited";

export type QuotaMetric = {
  id: string;
  label: string;
  used: number;
  limit: number;
  reserved: number;
  unit?: "GiB";
  href: string;
  level: QuotaLevel;
};

export type OctaviaQuotaUsage = {
  loadbalancer: number;
  listener: number;
  pool: number;
  member: number;
  healthmonitor: number;
  l7policy: number;
  l7rule: number;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, name: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name} quota payload`);
  }
  return value as UnknownRecord;
}

function numberValue(record: UnknownRecord, key: string): number {
  const value = record[key];
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new Error(`Missing numeric quota field: ${key}`);
  }
  return parsed;
}

function nullableNumberValue(
  record: UnknownRecord,
  key: string,
): number | null {
  const value = record[key];
  if (value === null) return null;
  return numberValue(record, key);
}

function octaviaNullableNumberValue(
  record: UnknownRecord,
  key: keyof OctaviaQuotaUsage,
) {
  const aliases: Partial<Record<keyof OctaviaQuotaUsage, string>> = {
    loadbalancer: "load_balancer",
    healthmonitor: "health_monitor",
  };
  const actualKey = record[key] !== undefined ? key : (aliases[key] ?? key);
  return nullableNumberValue(record, actualKey);
}

export function quotaPercentage(metric: QuotaMetric): number | null {
  if (metric.limit < 0 || metric.limit === 0) return null;
  const consumed = metric.used + metric.reserved;
  return Math.min(100, Math.max(0, (consumed / metric.limit) * 100));
}

export function quotaLevel(used: number, limit: number): QuotaLevel {
  if (limit < 0) return "unlimited";
  if (limit === 0) return used > 0 ? "critical" : "normal";

  const ratio = used / limit;
  if (ratio >= 1) return "critical";
  if (ratio >= 0.8) return "warning";
  return "normal";
}

function metric(
  id: string,
  label: string,
  used: number,
  limit: number,
  href: string,
  options: { reserved?: number; unit?: "GiB" } = {},
): QuotaMetric {
  const reserved = options.reserved ?? 0;

  return {
    id,
    label,
    used,
    limit,
    reserved,
    unit: options.unit,
    href,
    level: quotaLevel(used + reserved, limit),
  };
}

function detailedMetric(
  quotaSet: UnknownRecord,
  service: string,
  id: string,
  label: string,
  href: string,
  options: { divisor?: number; unit?: "GiB" } = {},
) {
  const detail = asRecord(quotaSet[id], `${service} ${id}`);
  const divisor = options.divisor ?? 1;

  return metric(
    id,
    label,
    numberValue(detail, "in_use") / divisor,
    numberValue(detail, "limit") / divisor,
    href,
    {
      reserved: numberValue(detail, "reserved") / divisor,
      unit: options.unit,
    },
  );
}

function optionalDetailedMetric(
  quotaSet: UnknownRecord,
  service: string,
  id: string,
  label: string,
  href: string,
  options: { divisor?: number; unit?: "GiB" } = {},
) {
  return quotaSet[id] === undefined || quotaSet[id] === null
    ? []
    : [detailedMetric(quotaSet, service, id, label, href, options)];
}

export function parseNovaQuotaDetails(payload: unknown): QuotaMetric[] {
  const quotaSet = asRecord(
    asRecord(payload, "Nova").quota_set,
    "Nova quota set",
  );

  return [
    detailedMetric(
      quotaSet,
      "Nova",
      "instances",
      "Instances",
      "/compute/instances",
    ),
    detailedMetric(quotaSet, "Nova", "cores", "VCPUs", "/compute/instances"),
    detailedMetric(quotaSet, "Nova", "ram", "RAM", "/compute/instances", {
      divisor: 1024,
      unit: "GiB",
    }),
    ...optionalDetailedMetric(
      quotaSet,
      "Nova",
      "server_groups",
      "Server groups",
      "/compute/instances",
    ),
    ...optionalDetailedMetric(
      quotaSet,
      "Nova",
      "server_group_members",
      "Server group members",
      "/compute/instances",
    ),
    ...optionalDetailedMetric(
      quotaSet,
      "Nova",
      "key_pairs",
      "Key pairs",
      "/compute/key-pairs",
    ),
    ...optionalDetailedMetric(
      quotaSet,
      "Nova",
      "metadata_items",
      "Metadata items per instance",
      "/compute/instances",
    ),
  ];
}

export function parseCinderQuotaDetails(payload: unknown): QuotaMetric[] {
  const quotaSet = asRecord(
    asRecord(payload, "Cinder").quota_set,
    "Cinder quota set",
  );

  return [
    detailedMetric(
      quotaSet,
      "Cinder",
      "volumes",
      "Volumes",
      "/compute/volumes",
    ),
    detailedMetric(
      quotaSet,
      "Cinder",
      "snapshots",
      "Snapshots",
      "/compute/snapshots",
    ),
    detailedMetric(
      quotaSet,
      "Cinder",
      "gigabytes",
      "Volume storage",
      "/compute/volumes",
      { unit: "GiB" },
    ),
    ...optionalDetailedMetric(
      quotaSet,
      "Cinder",
      "backups",
      "Volume backups",
      "/compute/volumes",
    ),
    ...optionalDetailedMetric(
      quotaSet,
      "Cinder",
      "backup_gigabytes",
      "Backup storage",
      "/compute/volumes",
      { unit: "GiB" },
    ),
    ...optionalDetailedMetric(
      quotaSet,
      "Cinder",
      "groups",
      "Volume groups",
      "/compute/volumes",
    ),
  ];
}

export function parseManilaQuotaDetails(payload: unknown): QuotaMetric[] {
  const quotaSet = asRecord(
    asRecord(payload, "Manila").quota_set,
    "Manila quota set",
  );

  return [
    detailedMetric(quotaSet, "Manila", "shares", "Shares", "/file-system"),
    detailedMetric(
      quotaSet,
      "Manila",
      "gigabytes",
      "Share storage",
      "/file-system",
      { unit: "GiB" },
    ),
    detailedMetric(
      quotaSet,
      "Manila",
      "snapshots",
      "Share snapshots",
      "/file-system",
    ),
    detailedMetric(
      quotaSet,
      "Manila",
      "snapshot_gigabytes",
      "Share snapshot storage",
      "/file-system",
      { unit: "GiB" },
    ),
    detailedMetric(
      quotaSet,
      "Manila",
      "share_networks",
      "Share networks",
      "/file-system",
    ),
  ];
}

export function parseMagnumQuota(
  payload: unknown,
  clusterCount: number,
): QuotaMetric[] {
  const quota = asRecord(payload, "Magnum");
  if (!Number.isInteger(clusterCount) || clusterCount < 0) {
    throw new Error("Invalid Magnum cluster usage");
  }

  return [
    metric(
      "clusters",
      "Kubernetes clusters",
      clusterCount,
      numberValue(quota, "hard_limit"),
      "/kubernetes/clusters",
    ),
  ];
}

export function parseOctaviaQuotaDetails(
  projectPayload: unknown,
  defaultPayload: unknown,
  usage: OctaviaQuotaUsage,
): QuotaMetric[] {
  const projectQuota = asRecord(
    asRecord(projectPayload, "Octavia project").quota,
    "Octavia project quota",
  );
  const defaultQuota = asRecord(
    asRecord(defaultPayload, "Octavia defaults").quota,
    "Octavia default quota",
  );
  const definitions = [
    ["loadbalancer", "Load balancers"],
    ["listener", "Listeners"],
    ["pool", "Pools"],
    ["member", "Pool members"],
    ["healthmonitor", "Health monitors"],
    ["l7policy", "L7 policies"],
    ["l7rule", "L7 rules"],
  ] as const;

  return definitions.map(([id, label]) => {
    const projectLimit = octaviaNullableNumberValue(projectQuota, id);
    const limit =
      projectLimit === null
        ? octaviaNullableNumberValue(defaultQuota, id)
        : projectLimit;
    if (limit === null) {
      throw new Error(`Missing effective Octavia quota field: ${id}`);
    }
    const used = usage[id];
    if (!Number.isInteger(used) || used < 0) {
      throw new Error(`Invalid Octavia ${id} usage`);
    }

    return metric(id, label, used, limit, "/quotas");
  });
}

export function parseNeutronLimits(payload: unknown): QuotaMetric[] {
  const quota = asRecord(asRecord(payload, "Neutron").quota, "Neutron quota");
  const definitions = [
    ["network", "Networks", "/compute/networks"],
    ["port", "Ports", "/compute/networks"],
    ["router", "Routers", "/compute/networks"],
    ["floatingip", "Floating IPs", "/compute/networks"],
    ["security_group", "Security groups", "/compute/networks"],
    ["security_group_rule", "Security group rules", "/compute/networks"],
  ] as const;

  return definitions.flatMap(([id, label, href]) => {
    if (quota[id] === undefined || quota[id] === null) return [];

    const detail = asRecord(quota[id], `Neutron ${id}`);
    return [
      metric(
        id,
        label,
        numberValue(detail, "used"),
        numberValue(detail, "limit"),
        href,
        { reserved: numberValue(detail, "reserved") },
      ),
    ];
  });
}
