import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Project, Region } from '@/types/openstack';

interface KeystoneState {
  region: Region | null;
  project: Project | null;
  setRegion: (region: Region | null) => void;
  setProject: (project: Project | null) => void;
}

export const useKeystoneStore = create<KeystoneState>()(
  persist(
    (set) => ({
      region: null,
      project: null,
      setRegion: (region) => set({ region }),
      setProject: (project) => set({ project }),
    }),
    {
      name: 'keystone-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
