'use client';

import React, { createContext, useContext, useState } from 'react';
import type { Project, Region } from '@/types/openstack';

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

  return (
    <KeystoneContext.Provider value={{ region, setRegion, project, setProject }}>
      {children}
    </KeystoneContext.Provider>
  );
}

export function useKeystone() {
  return useContext(KeystoneContext);
}
