/**
 * TanStack Query hook for project-scoped tokens
 */

import { useQuery } from '@tanstack/react-query';
import { useKeystoneStore } from '@/stores/useKeystoneStore';
import { getProjectToken } from '@/lib/openstack/keystone-actions';

/**
 * Hook to fetch/manage project-scoped token
 * This fetches a token scoped to the current project from Keystone
 * The token is stored client-side in TanStack Query cache
 */
export function useProjectToken() {
  const project = useKeystoneStore((state) => state.project);

  return useQuery({
    queryKey: ['projectToken', project?.id],
    queryFn: async () => {
      if (!project?.id) throw new Error('Project ID not set');

      return await getProjectToken(project.id);
    },
    enabled: !!project?.id,
    staleTime: 30 * 60 * 1000, // Token valid for 30 minutes
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
  });
}
