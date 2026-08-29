"use client";

import { FolderKanban } from "lucide-react";
import { useCloudContext } from "@/components/cloud/CloudContext";
import { setProject } from "@/lib/keystone/actions";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Selector } from "./Selector";

export function ProjectSelector() {
  const { projects, project: activeProject } = useCloudContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const selectedProject = projects.find(
    (project) => project.id === activeProject.id,
  );

  if (!selectedProject) return null;

  const handleSelect = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
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
      collapseLabelOnMobile
    />
  );
}
