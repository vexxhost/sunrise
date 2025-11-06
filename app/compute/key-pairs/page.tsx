import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { getSession } from '@/lib/session';
import { getSelectedRegion, getSelectedProject } from '@/lib/keystone/actions';
import { KeypairsTable } from './KeypairsTable';
import type { KeypairListResponse } from '@/types/openstack';

export default async function Page() {
  const queryClient = makeQueryClient();

  // Get region and project for the query key
  const regionId = await getSelectedRegion();
  const projectId = await getSelectedProject();

  // Prefetch keypairs data on the server
  await queryClient.prefetchQuery({
    queryKey: [regionId, projectId, 'keypairs'],
    queryFn: async () => {
      if (!regionId || !projectId) {
        return [];
      }

      const session = await getSession();
      if (!session.keystone_unscoped_token) {
        return [];
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
          return [];
        }

        const token = tokenResponse.headers.get('X-Subject-Token');
        if (!token) {
          return [];
        }

        // Get service catalog
        const catalogResponse = await fetch(`${process.env.KEYSTONE_API}/v3/auth/catalog`, {
          headers: {
            'X-Auth-Token': token,
          },
          next: { revalidate: 300 }, // Cache for 5 minutes
        });

        if (!catalogResponse.ok) {
          return [];
        }

        const catalogData = await catalogResponse.json();
        const serviceEntry = catalogData.catalog.find(
          (item: any) => item.type === 'compute' || item.name === 'nova'
        );

        if (!serviceEntry) {
          return [];
        }

        const endpoint = serviceEntry.endpoints.find(
          (ep: any) => ep.interface === 'public' && ep.region === regionId
        );

        if (!endpoint) {
          return [];
        }

        // Fetch keypairs from Nova API
        const response = await fetch(`${endpoint.url}/os-keypairs`, {
          headers: {
            'X-Auth-Token': token,
            'OpenStack-API-Version': 'compute 2.79',
          },
          next: { revalidate: 60 }, // Cache for 1 minute
        });

        if (!response.ok) {
          return [];
        }

        const data = await response.json() as KeypairListResponse;
        return data.keypairs.map(item => item.keypair);
      } catch (error) {
        console.error('Error fetching keypairs:', error);
        return [];
      }
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KeypairsTable regionId={regionId} projectId={projectId} />
    </HydrationBoundary>
  );
}
