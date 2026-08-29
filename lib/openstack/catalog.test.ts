import { describe, expect, it } from 'vitest';
import {
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from '@/lib/openstack/catalog';

const catalog: OpenStackCatalogService[] = [
  {
    id: 'nova-id',
    name: 'nova',
    type: 'compute',
    endpoints: [
      {
        interface: 'internal',
        region: 'RegionOne',
        url: 'https://nova.internal.example.test',
      },
      {
        interface: 'public',
        region: 'RegionOne',
        url: 'https://nova.example.test',
      },
    ],
  },
  {
    id: 'cinder-id',
    name: 'cinderv3',
    type: 'volumev3',
    endpoints: [
      {
        interface: 'public',
        region_id: 'RegionTwo',
        url: 'https://cinder.example.test/v3/project-id',
      },
    ],
  },
];

describe('OpenStack service endpoint resolution', () => {
  it('resolves a public endpoint by service type and region', () => {
    expect(
      resolveServiceEndpoint(catalog, 'RegionOne', 'compute', 'nova')
    ).toBe('https://nova.example.test');
  });

  it('falls back to the service name when the requested type differs', () => {
    expect(
      resolveServiceEndpoint(catalog, 'RegionOne', 'legacy-compute', 'nova')
    ).toBe('https://nova.example.test');
  });

  it('supports catalogs that identify the region with region_id', () => {
    expect(
      resolveServiceEndpoint(catalog, 'RegionTwo', 'volumev3', 'cinder')
    ).toBe('https://cinder.example.test/v3/project-id');
  });

  it('does not select an internal endpoint or an endpoint from another region', () => {
    expect(
      resolveServiceEndpoint(catalog, 'RegionTwo', 'compute', 'nova')
    ).toBeNull();
    expect(
      resolveServiceEndpoint(
        [
          {
            name: 'neutron',
            type: 'network',
            endpoints: [
              {
                interface: 'internal',
                region: 'RegionOne',
                url: 'https://neutron.internal.example.test',
              },
            ],
          },
        ],
        'RegionOne',
        'network',
        'neutron'
      )
    ).toBeNull();
  });

  it('returns null when the service is absent', () => {
    expect(
      resolveServiceEndpoint(catalog, 'RegionOne', 'network', 'neutron')
    ).toBeNull();
  });
});
