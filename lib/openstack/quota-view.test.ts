import { describe, expect, it } from 'vitest';
import type { OverviewService } from '@/lib/openstack/overview';
import {
  buildQuotaRows,
  filterQuotaRows,
} from '@/lib/openstack/quota-view';

const services: OverviewService[] = [
  {
    id: 'compute',
    label: 'Compute',
    href: '/compute/instances',
    status: 'available',
    metrics: [
      {
        id: 'instances',
        label: 'Instances',
        used: 8,
        limit: 10,
        reserved: 0,
        href: '/compute/instances',
        level: 'warning',
      },
      {
        id: 'cores',
        label: 'VCPUs',
        used: 4,
        limit: -1,
        reserved: 0,
        href: '/compute/instances',
        level: 'unlimited',
      },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    href: '/compute/networks',
    status: 'available',
    metrics: [
      {
        id: 'port',
        label: 'Ports',
        used: 9,
        limit: 500,
        reserved: 1,
        href: '/compute/networks',
        level: 'normal',
      },
    ],
  },
];

describe('quota view filtering', () => {
  const rows = buildQuotaRows(services);

  it('flattens service metrics with their service context', () => {
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({
      id: 'port',
      serviceId: 'network',
      serviceLabel: 'Network',
    });
  });

  it('searches resource and service labels case-insensitively', () => {
    expect(
      filterQuotaRows(rows, {
        query: 'NETWORK',
        service: 'all',
        status: 'all',
      }).map((row) => row.id)
    ).toEqual(['port']);
    expect(
      filterQuotaRows(rows, {
        query: 'vcpu',
        service: 'all',
        status: 'all',
      }).map((row) => row.id)
    ).toEqual(['cores']);
  });

  it('filters by service', () => {
    expect(
      filterQuotaRows(rows, {
        query: '',
        service: 'compute',
        status: 'all',
      }).map((row) => row.id)
    ).toEqual(['instances', 'cores']);
  });

  it('groups warning and critical quotas under attention', () => {
    expect(
      filterQuotaRows(rows, {
        query: '',
        service: 'all',
        status: 'attention',
      }).map((row) => row.id)
    ).toEqual(['instances']);
  });

  it('filters unlimited quotas independently', () => {
    expect(
      filterQuotaRows(rows, {
        query: '',
        service: 'all',
        status: 'unlimited',
      }).map((row) => row.id)
    ).toEqual(['cores']);
  });
});
