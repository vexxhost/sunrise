'use client';

import React, { createContext, useContext, useState } from 'react';
import type { Project } from '@/types/openstack';

interface KeystoneContextType {
  region: string | null;
  setRegion: (region: string) => void;
  project: Project | null;
  setProject: (project: Project) => void;
  projectId: string | null; // Derived from project.id for convenience
}

const KeystoneContext = createContext<KeystoneContextType>({
  region: null,
  setRegion: () => {},
  project: null,
  setProject: () => {},
  projectId: null,
});

export function KeystoneProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [region, setRegion] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  // Derive projectId from project for convenience in query keys
  const projectId = project?.id ?? null;

  return (
    <KeystoneContext.Provider value={{ region, setRegion, project, setProject, projectId }}>
      {children}
    </KeystoneContext.Provider>
  );
}

export function useKeystone() {
  return useContext(KeystoneContext);
}
