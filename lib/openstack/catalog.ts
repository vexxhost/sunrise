import { redirect } from 'next/navigation';

export type OpenStackCatalogEndpoint = {
  interface: string;
  region?: string;
  region_id?: string;
  url: string;
};

export type OpenStackCatalogService = {
  id?: string;
  name: string;
  type: string;
  endpoints: OpenStackCatalogEndpoint[];
};

export async function getServiceCatalog(
  token: string
): Promise<OpenStackCatalogService[] | null> {
  let catalogResponse: Response;
  try {
    catalogResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/catalog`, {
      headers: {
        'X-Auth-Token': token,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[catalog] failed to fetch service catalog', { error });
    return null;
  }

  if (!catalogResponse.ok) {
    if (catalogResponse.status === 401) {
      redirect('/auth/logout?reason=expired');
    }
    console.error('[catalog] service catalog request failed', {
      requestId:
        catalogResponse.headers.get('x-openstack-request-id') ?? undefined,
      status: catalogResponse.status,
    });
    return null;
  }

  try {
    const catalogData = (await catalogResponse.json()) as {
      catalog?: OpenStackCatalogService[];
    };
    return catalogData.catalog ?? [];
  } catch (error) {
    console.error('[catalog] failed to parse service catalog', { error });
    return null;
  }
}

export function resolveServiceEndpoint(
  catalog: OpenStackCatalogService[],
  regionId: string,
  serviceType: string,
  serviceName: string
): string | null {
  const serviceEntry = catalog.find(
    (item) => item.type === serviceType || item.name === serviceName
  );
  if (!serviceEntry) return null;

  const endpointEntry = serviceEntry.endpoints.find(
    (endpoint) =>
      endpoint.interface === 'public' &&
      (endpoint.region === regionId || endpoint.region_id === regionId)
  );

  return endpointEntry?.url ?? null;
}

/**
 * Get service endpoint URL from OpenStack service catalog
 * Fetches from Keystone and returns the direct OpenStack endpoint URL
 */
export async function getServiceEndpoint(
  regionId: string,
  serviceType: string,
  serviceName: string,
  token: string
): Promise<string | null> {
  const catalog = await getServiceCatalog(token);
  if (!catalog) return null;

  const endpoint = resolveServiceEndpoint(
    catalog,
    regionId,
    serviceType,
    serviceName
  );
  if (!endpoint) {
    console.error('[catalog] public service endpoint not found', {
      regionId,
      serviceName,
      serviceType,
    });
  }
  return endpoint;
}
