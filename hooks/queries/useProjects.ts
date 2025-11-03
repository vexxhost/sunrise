/**
 * TanStack Query hooks for Keystone Projects
 */

import { useQuery } from '@tanstack/react-query';
import ky from 'ky';
import type { Project } from '@/lib/keystone';

/**
 * Hook to fetch list of user's projects
 * Note: Projects are user-specific, not region-specific
 */
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await ky.get('/api/proxy/keystone/v3/auth/projects').json<{ projects: Project[] }>();
      // Sort projects alphabetically by name
      const sortedProjects = data.projects.sort((a, b) => a.name.localeCompare(b.name));
      return sortedProjects;
    },
  });
}
