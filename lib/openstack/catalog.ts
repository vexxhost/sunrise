import { redirect } from 'next/navigation';

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
  // Fetch from catalog and return direct OpenStack URL
  let catalogResponse: Response;
  try {
    // Get service catalog
    catalogResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/catalog`, {
      headers: {
        'X-Auth-Token': token,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[catalog] failed to fetch service catalog', {
      error,
      serviceName,
      serviceType,
    });
    return null;
  }

  if (!catalogResponse.ok) {
    if (catalogResponse.status === 401) {
      redirect('/auth/logout?reason=expired');
    }
    return null;
  }

  try {
    const catalogData = await catalogResponse.json();
    const serviceEntry = catalogData.catalog.find(
      (item: any) => item.type === serviceType || item.name === serviceName
    );

    if (!serviceEntry) {
      console.error('[catalog] service not found', {
        serviceName,
        serviceType,
      });
      // TODO(diagnostic): remove once s3 catalog lookup is verified.
      console.error(
        '[catalog] available services:',
        (catalogData.catalog ?? []).map((s: any) => ({ type: s.type, name: s.name }))
      );
      return null;
    }

    const endpointEntry = serviceEntry.endpoints.find(
      (ep: any) => ep.interface === 'public' && ep.region === regionId
    );

    if (!endpointEntry) {
      console.error('[catalog] public endpoint not found', {
        regionId,
        serviceName,
        serviceType,
      });
      // TODO(diagnostic): remove once s3 catalog lookup is verified.
      console.error(
        '[catalog] endpoints for service:',
        (serviceEntry.endpoints ?? []).map((ep: any) => ({
          interface: ep.interface,
          region: ep.region,
          region_id: ep.region_id,
          url: ep.url,
        }))
      );
      return null;
    }

    return endpointEntry.url;
  } catch (error) {
    console.error('[catalog] failed to parse service catalog', {
      error,
      serviceName,
      serviceType,
    });
    return null;
  }
}
