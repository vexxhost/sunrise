'use client';

import { useEffect } from 'react';
import { useKeystoneStore } from '@/stores/useKeystoneStore';
import { useRegions } from '@/hooks/queries/useRegions';
import { useProjects } from '@/hooks/queries/useProjects';
import Cookies from 'js-cookie';

/**
 * Client component that syncs selected region/project from cookies to Zustand store
 * This ensures backward compatibility with existing code that reads from Zustand
 */
export function CookieSync() {
  const { setRegion, setProject } = useKeystoneStore();
  const { data: regions = [] } = useRegions();
  const { data: projects = [] } = useProjects();

  useEffect(() => {
    // Sync region from cookie to Zustand
    const selectedRegionId = Cookies.get('selected-region');
    if (selectedRegionId && regions.length > 0) {
      const region = regions.find(r => r.id === selectedRegionId);
      if (region) {
        setRegion(region);
      }
    } else if (!selectedRegionId && regions.length > 0) {
      // Set default region if none selected
      setRegion(regions[0]);
    }
  }, [regions, setRegion]);

  useEffect(() => {
    // Sync project from cookie to Zustand
    const selectedProjectId = Cookies.get('selected-project');
    if (selectedProjectId && projects.length > 0) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        setProject(project);
      }
    } else if (!selectedProjectId && projects.length > 0) {
      // Set default project if none selected
      setProject(projects[0]);
    }
  }, [projects, setProject]);

  return null; // This component doesn't render anything
}
