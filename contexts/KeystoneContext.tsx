'use client';

import React, { createContext, useContext, useState } from 'react';

interface KeystoneContextType {
  region: string | null;
  setRegion: (region: string) => void;
  projectId: string | null;
  setProjectId: (projectId: string) => void;
}

const KeystoneContext = createContext<KeystoneContextType>({
  region: null,
  setRegion: () => {},
  projectId: null,
  setProjectId: () => {},
});

export function KeystoneProvider({
  children,
  initialProjectId,
}: {
  children: React.ReactNode;
  initialProjectId?: string;
}) {
  const [region, setRegion] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId || null);

  return (
    <KeystoneContext.Provider value={{ region, setRegion, projectId, setProjectId }}>
      {children}
    </KeystoneContext.Provider>
  );
}

export function useKeystone() {
  return useContext(KeystoneContext);
}
