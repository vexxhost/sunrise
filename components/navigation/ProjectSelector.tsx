'use client';

import { FolderKanban } from "lucide-react";
import { setProjectAction } from "@/lib/keystone/actions";
import { useRouter } from "next/navigation";
import type { Project } from "@/types/openstack";
import { Selector } from "./Selector";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProject: Project;
}

export function ProjectSelector({ projects, selectedProject }: ProjectSelectorProps) {
  const router = useRouter();

  const handleSelect = async (projectId: string) => {
    await setProjectAction(projectId);
    router.refresh();
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
