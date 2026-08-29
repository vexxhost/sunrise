import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServiceCatalog: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/openstack/catalog', async (importOriginal) => {
  const original = await importOriginal<
    typeof import('@/lib/openstack/catalog')
  >();
  return {
    ...original,
    getServiceCatalog: mocks.getServiceCatalog,
  };
});

import { loadProjectOverview } from '@/lib/openstack/overview';
import type { OpenStackCatalogService } from '@/lib/openstack/catalog';

const catalog: OpenStackCatalogService[] = [
  {
    name: 'nova',
    type: 'compute',
    endpoints: [
      {
        interface: 'public',
        region: 'RegionOne',
        url: 'https://nova.example.test',
      },
    ],
  },
  {
    name: 'cinder',
    type: 'volumev3',
    endpoints: [
      {
        interface: 'public',
        region: 'RegionOne',
        url: 'https://cinder.example.test/v3/project-id/',
      },
    ],
  },
  {
    name: 'neutron',
    type: 'network',
    endpoints: [
      {
        interface: 'public',
        region_id: 'RegionOne',
        url: 'https://neutron.example.test/',
      },
    ],
  },
];

const successfulPayloads: Record<string, unknown> = {
  'https://nova.example.test/limits': {
    limits: {
      absolute: {
        totalInstancesUsed: 2,
        maxTotalInstances: 10,
        totalCoresUsed: 4,
        maxTotalCores: 20,
        totalRAMUsed: 8192,
        maxTotalRAMSize: 51200,
      },
    },
  },
  'https://cinder.example.test/v3/project-id/limits': {
    limits: {
      absolute: {
        totalVolumesUsed: 1,
        maxTotalVolumes: 10,
        totalSnapshotsUsed: 0,
        maxTotalSnapshots: 10,
        totalGigabytesUsed: 20,
        maxTotalVolumeGigabytes: 1000,
      },
    },
  },
  'https://neutron.example.test/v2.0/quotas/project-id/details.json': {
    quota: {
      network: { used: 1, limit: 100, reserved: 0 },
      port: { used: 8, limit: 500, reserved: 1 },
      router: { used: 1, limit: 10, reserved: 0 },
      floatingip: { used: 1, limit: 50, reserved: 0 },
      security_group: { used: 4, limit: 10, reserved: 0 },
      security_group_rule: { used: 26, limit: 100, reserved: 0 },
    },
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('project overview loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getServiceCatalog.mockReset();
    mocks.redirect.mockClear();
  });

  it('returns selection guidance without requesting the catalog', async () => {
    const services = await loadProjectOverview({});

    expect(services).toHaveLength(3);
    expect(services.every((service) => service.status === 'unavailable')).toBe(
      true
    );
    expect(services[0].message).toBe('Select a project and region');
    expect(mocks.getServiceCatalog).not.toHaveBeenCalled();
  });

  it('shows a service-level fallback when the catalog is unavailable', async () => {
    mocks.getServiceCatalog.mockResolvedValue(null);

    const services = await loadProjectOverview({
      token: 'project-token',
      regionId: 'RegionOne',
      projectId: 'project-id',
    });

    expect(services).toHaveLength(3);
    expect(
      services.every(
        (service) =>
          service.status === 'unavailable' &&
          service.message === 'Service catalog is unavailable'
      )
    ).toBe(true);
  });

  it('loads all services concurrently from the active region and project', async () => {
    mocks.getServiceCatalog.mockResolvedValue(catalog);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const payload = successfulPayloads[url];
        if (!payload) throw new Error(`Unexpected URL: ${url}`);

        expect(init).toMatchObject({ cache: 'no-store' });
        expect((init?.headers as Record<string, string>)['X-Auth-Token']).toBe(
          'project-token'
        );
        return jsonResponse(payload);
      });

    const services = await loadProjectOverview({
      token: 'project-token',
      regionId: 'RegionOne',
      projectId: 'project-id',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(services.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'compute', status: 'available' },
      { id: 'storage', status: 'available' },
      { id: 'network', status: 'available' },
    ]);
    expect(services[0].metrics[2]).toMatchObject({
      id: 'ram',
      used: 8,
      limit: 50,
      unit: 'GiB',
    });
  });

  it('represents missing endpoints and permission failures independently', async () => {
    mocks.getServiceCatalog.mockResolvedValue(
      catalog.filter((service) => service.type !== 'volumev3')
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('neutron')) return jsonResponse({}, 403);
      return jsonResponse(successfulPayloads[url]);
    });

    const services = await loadProjectOverview({
      token: 'project-token',
      regionId: 'RegionOne',
      projectId: 'project-id',
    });

    expect(services.find(({ id }) => id === 'compute')?.status).toBe(
      'available'
    );
    expect(services.find(({ id }) => id === 'storage')).toMatchObject({
      status: 'unavailable',
      message: 'Not available in RegionOne',
    });
    expect(services.find(({ id }) => id === 'network')).toMatchObject({
      status: 'forbidden',
      message: 'Quota details require permission',
    });
  });

  it('does not turn malformed quota responses into zero usage', async () => {
    mocks.getServiceCatalog.mockResolvedValue([catalog[0]]);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ limits: { absolute: {} } })
    );

    const services = await loadProjectOverview({
      token: 'project-token',
      regionId: 'RegionOne',
      projectId: 'project-id',
    });

    expect(services[0]).toMatchObject({
      status: 'error',
      metrics: [],
      message: 'Quota response was not recognized',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[overview/compute] invalid quota response',
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it('redirects to logout when an OpenStack token has expired', async () => {
    mocks.getServiceCatalog.mockResolvedValue([catalog[0]]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 401));

    await expect(
      loadProjectOverview({
        token: 'expired-token',
        regionId: 'RegionOne',
        projectId: 'project-id',
      })
    ).rejects.toThrow('redirect:/auth/logout?reason=expired');
    expect(mocks.redirect).toHaveBeenCalledWith('/auth/logout?reason=expired');
  });
});
