'use client';

import { FolderKanban } from "lucide-react";
import { setProjectAction } from "@/lib/keystone/actions";
import { useKeystoneStore } from "@/stores/useKeystoneStore";
import type { Project } from "@/types/openstack";
import { Selector } from "./Selector";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProject: Project;
}

export function ProjectSelector({ projects, selectedProject }: ProjectSelectorProps) {
  const setProject = useKeystoneStore(state => state.setProject);

  const handleSelect = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setProject(project);
    }
    await setProjectAction(projectId);
  };

  return (
    <Selector
      items={projects}
      selectedItem={selectedProject}
      icon={FolderKanban}
      displayKey="name"
      onSelect={handleSelect}
      listClassName="min-w-[200px] max-h-[400px] overflow-y-auto"
    />
  );
}
