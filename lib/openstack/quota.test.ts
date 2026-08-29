import { describe, expect, it } from 'vitest';
import {
  parseCinderLimits,
  parseNeutronLimits,
  parseNovaLimits,
  quotaLevel,
  quotaPercentage,
} from '@/lib/openstack/quota';

describe('OpenStack quota parsing', () => {
  it('maps Nova absolute limits and converts MiB to GiB', () => {
    const metrics = parseNovaLimits({
      limits: {
        absolute: {
          totalInstancesUsed: 3,
          maxTotalInstances: 10,
          totalCoresUsed: 6,
          maxTotalCores: 20,
          totalRAMUsed: 6144,
          maxTotalRAMSize: 51200,
        },
      },
    });

    expect(metrics.map(({ id, used, limit, unit }) => ({
      id,
      used,
      limit,
      unit,
    }))).toEqual([
      { id: 'instances', used: 3, limit: 10, unit: undefined },
      { id: 'cores', used: 6, limit: 20, unit: undefined },
      { id: 'ram', used: 6, limit: 50, unit: 'GiB' },
    ]);
  });

  it('maps Cinder volume, snapshot, and capacity limits', () => {
    const metrics = parseCinderLimits({
      limits: {
        absolute: {
          totalVolumesUsed: 2,
          maxTotalVolumes: 10,
          totalSnapshotsUsed: 1,
          maxTotalSnapshots: 10,
          totalGigabytesUsed: 120,
          maxTotalVolumeGigabytes: 1000,
        },
      },
    });

    expect(metrics.map((item) => item.id)).toEqual([
      'volumes',
      'snapshots',
      'gigabytes',
    ]);
    expect(metrics[2]).toMatchObject({ used: 120, limit: 1000, unit: 'GiB' });
  });

  it('preserves Neutron reserved quota separately from usage', () => {
    const detail = (used: number, limit: number, reserved = 0) => ({
      used,
      limit,
      reserved,
    });
    const metrics = parseNeutronLimits({
      quota: {
        network: detail(2, 100),
        port: detail(8, 500, 2),
        router: detail(1, 10),
        floatingip: detail(1, 50),
        security_group: detail(3, 10),
        security_group_rule: detail(12, 100),
      },
    });

    expect(metrics.find((item) => item.id === 'port')).toMatchObject({
      used: 8,
      limit: 500,
      reserved: 2,
    });
  });

  it('handles warning, critical, zero, and unlimited quotas', () => {
    expect(quotaLevel(8, 10)).toBe('warning');
    expect(quotaLevel(10, 10)).toBe('critical');
    expect(quotaLevel(0, 0)).toBe('normal');
    expect(quotaLevel(100, -1)).toBe('unlimited');
    expect(
      quotaPercentage({
        id: 'example',
        label: 'Example',
        used: 12,
        limit: 10,
        reserved: 0,
        href: '/',
        level: 'critical',
      })
    ).toBe(100);
  });

  it('rejects incomplete API payloads instead of showing fake zeroes', () => {
    expect(() => parseNovaLimits({ limits: { absolute: {} } })).toThrow(
      'Missing numeric quota field'
    );
  });
});
