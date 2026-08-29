import 'server-only';

import { redirect } from 'next/navigation';
import {
  getServiceCatalog,
  resolveServiceEndpoint,
  type OpenStackCatalogService,
} from '@/lib/openstack/catalog';
import {
  parseCinderLimits,
  parseNeutronLimits,
  parseNovaLimits,
  type QuotaMetric,
} from '@/lib/openstack/quota';

export type OverviewServiceId = 'compute' | 'storage' | 'network';
export type OverviewServiceStatus =
  | 'available'
  | 'forbidden'
  | 'unavailable'
  | 'error';

export type OverviewService = {
  id: OverviewServiceId;
  label: string;
  href: string;
  status: OverviewServiceStatus;
  metrics: QuotaMetric[];
  message?: string;
};

type ServiceDefinition = {
  id: OverviewServiceId;
  label: string;
  href: string;
  serviceType: string;
  serviceName: string;
  path: (projectId: string) => string;
  apiVersion?: string;
  parse: (payload: unknown) => QuotaMetric[];
};

const serviceDefinitions: ServiceDefinition[] = [
  {
    id: 'compute',
    label: 'Compute',
    href: '/compute/instances',
    serviceType: 'compute',
    serviceName: 'nova',
    path: () => '/limits',
    apiVersion: 'compute 2.79',
    parse: parseNovaLimits,
  },
  {
    id: 'storage',
    label: 'Block storage',
    href: '/compute/volumes',
    serviceType: 'volumev3',
    serviceName: 'cinder',
    path: () => '/limits',
    parse: parseCinderLimits,
  },
  {
    id: 'network',
    label: 'Network',
    href: '/compute/networks',
    serviceType: 'network',
    serviceName: 'neutron',
    path: (projectId) => `/v2.0/quotas/${projectId}/details.json`,
    parse: parseNeutronLimits,
  },
];

function unavailableService(
  definition: ServiceDefinition,
  message: string
): OverviewService {
  return {
    id: definition.id,
    label: definition.label,
    href: definition.href,
    status: 'unavailable',
    metrics: [],
    message,
  };
}

async function loadService(
  definition: ServiceDefinition,
  catalog: OpenStackCatalogService[],
  token: string,
  regionId: string,
  projectId: string
): Promise<OverviewService> {
  const endpoint = resolveServiceEndpoint(
    catalog,
    regionId,
    definition.serviceType,
    definition.serviceName
  );
  if (!endpoint) {
    return unavailableService(
      definition,
      `Not available in ${regionId}`
    );
  }

  const headers: Record<string, string> = { 'X-Auth-Token': token };
  if (definition.apiVersion) {
    headers['OpenStack-API-Version'] = definition.apiVersion;
  }

  let response: Response;
  try {
    response = await fetch(
      `${endpoint.replace(/\/$/, '')}${definition.path(projectId)}`,
      { headers, cache: 'no-store' }
    );
  } catch (error) {
    console.error(`[overview/${definition.id}] request failed`, { error });
    return {
      ...unavailableService(definition, 'Temporarily unreachable'),
      status: 'error',
    };
  }

  if (response.status === 401) {
    redirect('/auth/logout?reason=expired');
  }
  if (response.status === 403) {
    return {
      ...unavailableService(definition, 'Quota details require permission'),
      status: 'forbidden',
    };
  }
  if (!response.ok) {
    console.error(`[overview/${definition.id}] quota request failed`, {
      status: response.status,
      statusText: response.statusText,
    });
    return {
      ...unavailableService(definition, 'Quota details are unavailable'),
      status: response.status === 404 ? 'unavailable' : 'error',
    };
  }

  try {
    return {
      id: definition.id,
      label: definition.label,
      href: definition.href,
      status: 'available',
      metrics: definition.parse(await response.json()),
    };
  } catch (error) {
    console.error(`[overview/${definition.id}] invalid quota response`, {
      error,
    });
    return {
      ...unavailableService(definition, 'Quota response was not recognized'),
      status: 'error',
    };
  }
}

export async function loadProjectOverview({
  token,
  regionId,
  projectId,
}: {
  token?: string;
  regionId?: string;
  projectId?: string;
}): Promise<OverviewService[]> {
  if (!token || !regionId || !projectId) {
    return serviceDefinitions.map((definition) =>
      unavailableService(definition, 'Select a project and region')
    );
  }

  const catalog = await getServiceCatalog(token);
  if (!catalog) {
    return serviceDefinitions.map((definition) =>
      unavailableService(definition, 'Service catalog is unavailable')
    );
  }

  return Promise.all(
    serviceDefinitions.map((definition) =>
      loadService(definition, catalog, token, regionId, projectId)
    )
  );
}
