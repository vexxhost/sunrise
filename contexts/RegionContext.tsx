'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface RegionContextType {
  region: string | null;
  setRegion: (region: string) => void;
}

const RegionContext = createContext<RegionContextType>({
  region: null,
  setRegion: () => {},
});

export function RegionProvider({
  children,
  initialRegion
}: {
  children: React.ReactNode;
  initialRegion?: string;
}) {
  const [region, setRegion] = useState<string | null>(initialRegion || null);

  return (
    <RegionContext.Provider value={{ region, setRegion }}>
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion() {
  return useContext(RegionContext);
}
