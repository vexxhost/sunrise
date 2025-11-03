/**
 * TanStack Query hook for project-scoped tokens
 */

import { useQuery } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import { apiUrl } from '@/lib/api';
import ky from 'ky';

/**
 * Hook to fetch/manage project-scoped token
 * This fetches a token scoped to the current project from Keystone via the proxy
 * The token is stored client-side in TanStack Query cache
 */
export function useProjectToken() {
  const { projectId } = useKeystone();

  return useQuery({
    queryKey: ['projectToken', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID not set');

      // Request project-scoped token from Keystone via proxy
      // The proxy will use the unscoped token from session to get a scoped token
      const response = await ky.post(apiUrl('global', 'keystone', 'v3/auth/tokens'), {
        json: {
          auth: {
            identity: {
              methods: ['token'],
              token: {
                id: '__UNSCOPED__', // Special marker telling proxy to use session's unscoped token
              },
            },
            scope: {
              project: {
                id: projectId,
              },
            },
          },
        },
      });

      const token = response.headers.get('X-Subject-Token');
      const data = await response.json() as { token: any };

      return {
        token,
        data: data.token,
      };
    },
    enabled: !!projectId,
    staleTime: 30 * 60 * 1000, // Token valid for 30 minutes
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
  });
}
