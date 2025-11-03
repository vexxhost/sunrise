'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Project, Region } from '@/types/openstack';
import { useRegions } from '@/hooks/queries/useRegions';
import { useProjects } from '@/hooks/queries/useProjects';

interface KeystoneContextType {
  region: Region | null;
  setRegion: (region: Region) => void;
  project: Project | null;
  setProject: (project: Project) => void;
}

const KeystoneContext = createContext<KeystoneContextType>({
  region: null,
  setRegion: () => {},
  project: null,
  setProject: () => {},
});

export function KeystoneProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [region, setRegion] = useState<Region | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const { data: regions = [] } = useRegions();
  const { data: projects = [] } = useProjects();

  // Set default region to first available region
  useEffect(() => {
    if (!region && regions.length > 0) {
      setRegion(regions[0]);
    }
  }, [region, regions]);

  // Set default project to first available project
  useEffect(() => {
    if (!project && projects.length > 0) {
      setProject(projects[0]);
    }
  }, [project, projects]);

  return (
    <KeystoneContext.Provider value={{ region, setRegion, project, setProject }}>
      {children}
    </KeystoneContext.Provider>
  );
}

export function useKeystone() {
  return useContext(KeystoneContext);
}
