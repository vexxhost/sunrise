"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CloudContextSnapshot } from "@/lib/cloud-context-snapshot";

const CloudContext = createContext<CloudContextSnapshot | null>(null);

export function CloudContextProvider({
  value,
  children,
}: {
  value: CloudContextSnapshot;
  children: ReactNode;
}) {
  return (
    <CloudContext.Provider value={value}>{children}</CloudContext.Provider>
  );
}

export function useCloudContext() {
  const context = useContext(CloudContext);
  if (!context) {
    throw new Error("useCloudContext must be used within CloudContextProvider");
  }
  return context;
}
