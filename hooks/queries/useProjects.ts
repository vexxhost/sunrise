/**
 * TanStack Query hooks for Keystone Projects
 */

import { useQuery } from '@tanstack/react-query';
import { openstack } from '@/lib/openstack/actions';
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
      const data = await openstack<{ projects: Project[] }>({
        regionId: 'global',
        serviceType: 'identity',
        serviceName: 'keystone',
        path: '/v3/auth/projects',
        unscoped: true,
      });

      if (!data) {
        return [];
      }

      // Sort projects alphabetically by name
      return data.projects.sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
