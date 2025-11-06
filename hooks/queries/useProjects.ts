/**
 * TanStack Query hooks for Keystone Projects
 */

import { useQuery } from '@tanstack/react-query';
import { getProjectsAction } from '@/lib/openstack/keystone-actions';
import type { Project } from '@/types/openstack';

/**
 * Hook to fetch list of user's projects
 * Note: Projects are user-specific and global (not region-specific)
 * Uses unscoped token from server session
 */
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      return await getProjectsAction();
    },
  });
}
