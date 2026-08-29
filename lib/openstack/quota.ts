export type QuotaLevel = 'normal' | 'warning' | 'critical' | 'unlimited';

export type QuotaMetric = {
  id: string;
  label: string;
  used: number;
  limit: number;
  reserved: number;
  unit?: 'GiB';
  href: string;
  level: QuotaLevel;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, name: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${name} quota payload`);
  }
  return value as UnknownRecord;
}

function numberValue(record: UnknownRecord, key: string): number {
  const value = record[key];
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new Error(`Missing numeric quota field: ${key}`);
  }
  return parsed;
}

export function quotaPercentage(metric: QuotaMetric): number | null {
  if (metric.limit < 0 || metric.limit === 0) return null;
  const consumed = metric.used + metric.reserved;
  return Math.min(100, Math.max(0, (consumed / metric.limit) * 100));
}

export function quotaLevel(used: number, limit: number): QuotaLevel {
  if (limit < 0) return 'unlimited';
  if (limit === 0) return used > 0 ? 'critical' : 'normal';

  const ratio = used / limit;
  if (ratio >= 1) return 'critical';
  if (ratio >= 0.8) return 'warning';
  return 'normal';
}

function metric(
  id: string,
  label: string,
  used: number,
  limit: number,
  href: string,
  options: { reserved?: number; unit?: 'GiB' } = {}
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

export function parseNovaLimits(payload: unknown): QuotaMetric[] {
  const limits = asRecord(asRecord(payload, 'Nova').limits, 'Nova limits');
  const absolute = asRecord(limits.absolute, 'Nova absolute limits');

  return [
    metric(
      'instances',
      'Instances',
      numberValue(absolute, 'totalInstancesUsed'),
      numberValue(absolute, 'maxTotalInstances'),
      '/compute/instances'
    ),
    metric(
      'cores',
      'VCPUs',
      numberValue(absolute, 'totalCoresUsed'),
      numberValue(absolute, 'maxTotalCores'),
      '/compute/instances'
    ),
    metric(
      'ram',
      'RAM',
      numberValue(absolute, 'totalRAMUsed') / 1024,
      numberValue(absolute, 'maxTotalRAMSize') / 1024,
      '/compute/instances',
      { unit: 'GiB' }
    ),
  ];
}

export function parseCinderLimits(payload: unknown): QuotaMetric[] {
  const limits = asRecord(asRecord(payload, 'Cinder').limits, 'Cinder limits');
  const absolute = asRecord(limits.absolute, 'Cinder absolute limits');

  return [
    metric(
      'volumes',
      'Volumes',
      numberValue(absolute, 'totalVolumesUsed'),
      numberValue(absolute, 'maxTotalVolumes'),
      '/compute/volumes'
    ),
    metric(
      'snapshots',
      'Snapshots',
      numberValue(absolute, 'totalSnapshotsUsed'),
      numberValue(absolute, 'maxTotalSnapshots'),
      '/compute/snapshots'
    ),
    metric(
      'gigabytes',
      'Volume storage',
      numberValue(absolute, 'totalGigabytesUsed'),
      numberValue(absolute, 'maxTotalVolumeGigabytes'),
      '/compute/volumes',
      { unit: 'GiB' }
    ),
  ];
}

export function parseNeutronLimits(payload: unknown): QuotaMetric[] {
  const quota = asRecord(asRecord(payload, 'Neutron').quota, 'Neutron quota');
  const definitions = [
    ['network', 'Networks', '/compute/networks'],
    ['port', 'Ports', '/compute/networks'],
    ['router', 'Routers', '/compute/networks'],
    ['floatingip', 'Floating IPs', '/compute/networks'],
    ['security_group', 'Security groups', '/compute/networks'],
    ['security_group_rule', 'Security group rules', '/compute/networks'],
  ] as const;

  return definitions.flatMap(([id, label, href]) => {
    if (quota[id] === undefined || quota[id] === null) return [];

    const detail = asRecord(quota[id], `Neutron ${id}`);
    return [
      metric(
        id,
        label,
        numberValue(detail, 'used'),
        numberValue(detail, 'limit'),
        href,
        { reserved: numberValue(detail, 'reserved') }
      ),
    ];
  });
}
