/**
 * TanStack Query hooks for Keystone Projects
 */

import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import ky from 'ky';
import type { Project } from '@/lib/keystone';

/**
 * Hook to fetch list of user's projects
 * Note: Projects are user-specific and global (not region-specific)
 * Uses unscoped token from server session via __UNSCOPED__ marker
 */
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await ky.get(apiUrl('global', 'keystone', 'v3/auth/projects'), {
        headers: {
          'X-Auth-Token': '__UNSCOPED__', // Special marker for proxy to use session's unscoped token
        },
      }).json<{ projects: Project[] }>();
      // Sort projects alphabetically by name
      const sortedProjects = data.projects.sort((a, b) => a.name.localeCompare(b.name));
      return sortedProjects;
    },
  });
}
