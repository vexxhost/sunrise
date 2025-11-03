'use client';

import React, { createContext, useContext, useState } from 'react';
import type { Project, Region } from '@/types/openstack';
import { useRegions } from '@/hooks/queries/useRegions';
import { useProjects } from '@/hooks/queries/useProjects';

interface KeystoneContextType {
  region: Region | null;
  setRegion: (region: Region | null) => void;
  project: Project | null;
  setProject: (project: Project | null) => void;
  regions: Region[];
  projects: Project[];
}

const KeystoneContext = createContext<KeystoneContextType>({
  region: null,
  setRegion: () => {},
  project: null,
  setProject: () => {},
  regions: [],
  projects: [],
});

export function KeystoneProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: regions = [] } = useRegions();
  const { data: projects = [] } = useProjects();

  const [region, setRegion] = useState<Region | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  const currentRegion = region ?? regions[0] ?? null;
  const currentProject = project ?? projects[0] ?? null;

  return (
    <KeystoneContext.Provider
      value={{
        region: currentRegion,
        setRegion,
        project: currentProject,
        setProject,
        regions,
        projects,
      }}
    >
      {children}
    </KeystoneContext.Provider>
  );
}

export function useKeystone() {
  return useContext(KeystoneContext);
}
