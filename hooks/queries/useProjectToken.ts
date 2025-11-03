/**
 * TanStack Query hook for project-scoped tokens
 */

import { useQuery } from '@tanstack/react-query';
import { useKeystone } from '@/contexts/KeystoneContext';
import ky from 'ky';
import type { Project } from '@/lib/keystone';

/**
 * Hook to fetch/manage project-scoped token
 * This requests the server to get a token scoped to the current project
 * The token is stored server-side in the session for security
 */
export function useProjectToken() {
  const { projectId } = useKeystone();

  return useQuery({
    queryKey: ['projectToken', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID not set');

      // Request server to fetch and store project token in session
      const data = await ky.post('/api/auth/project-token', {
        json: { projectId },
      }).json<{ success: boolean; project: Project }>();

      return data;
    },
    enabled: !!projectId,
    staleTime: 30 * 60 * 1000, // Token valid for 30 minutes
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
  });
}
