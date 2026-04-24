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
  try {
    // Get service catalog
    const catalogResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/catalog`, {
      headers: {
        'X-Auth-Token': token,
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!catalogResponse.ok) {
      return null;
    }

    const catalogData = await catalogResponse.json();
    const serviceEntry = catalogData.catalog.find(
      (item: any) => item.type === serviceType || item.name === serviceName
    );

    if (!serviceEntry) {
      console.error(`Service '${serviceName}' (${serviceType}) not found in catalog`);
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
      console.error(`No public endpoint found for service '${serviceName}' in region '${regionId}'`);
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
    console.error(`Error getting ${serviceName} endpoint:`, error);
    return null;
  }
}
