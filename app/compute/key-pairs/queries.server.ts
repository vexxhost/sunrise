import { getSession } from '@/lib/session';

/**
 * Get project-scoped token and Nova endpoint for server-side use
 */
export async function getNovaAuth(
  regionId: string | undefined,
  projectId: string | undefined
): Promise<{ token: string; endpoint: string } | null> {
  if (!regionId || !projectId) {
    return null;
  }

  const session = await getSession();
  if (!session.keystone_unscoped_token) {
    return null;
  }

  try {
    // Get project-scoped token
    const tokenResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ['token'],
            token: {
              id: session.keystone_unscoped_token,
            },
          },
          scope: {
            project: {
              id: projectId,
            },
          },
        },
      }),
    });

    if (!tokenResponse.ok) {
      return null;
    }

    const token = tokenResponse.headers.get('X-Subject-Token');
    if (!token) {
      return null;
    }

    // Get service catalog
    const catalogResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/catalog`, {
      headers: {
        'X-Auth-Token': token,
      },
      next: { revalidate: 300 },
    });

    if (!catalogResponse.ok) {
      return null;
    }

    const catalogData = await catalogResponse.json();
    const serviceEntry = catalogData.catalog.find(
      (item: any) => item.type === 'compute' || item.name === 'nova'
    );

    if (!serviceEntry) {
      return null;
    }

    const endpointEntry = serviceEntry.endpoints.find(
      (ep: any) => ep.interface === 'public' && ep.region === regionId
    );

    if (!endpointEntry) {
      return null;
    }

    return {
      token,
      endpoint: endpointEntry.url,
    };
  } catch (error) {
    console.error('Error getting Nova auth:', error);
    return null;
  }
}
