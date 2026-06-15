'use client';

import { FolderKanban } from "lucide-react";
import { setProject } from "@/lib/keystone/actions";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Project } from "@/types/openstack";
import { Selector } from "./Selector";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProject: Project;
}

export function ProjectSelector({ projects, selectedProject }: ProjectSelectorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleSelect = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      await setProject(project);
      queryClient.clear();
      router.refresh();
    }
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
