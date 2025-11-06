'use client';

import { FolderKanban } from "lucide-react";
import { useKeystoneStore } from "@/stores/useKeystoneStore";
import { useProjects } from "@/hooks/queries/useProjects";
import { useEffect } from "react";
import {
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export function ProjectSelector() {
  const { project, setProject } = useKeystoneStore();
  const { data: projects = [] } = useProjects();

  useEffect(() => {
    if (!project && projects.length > 0) {
      setProject(projects[0]);
    }
  }, [project, projects, setProject]);

  if (!project || projects.length === 0) {
    return null;
  }

  return (
    <>
      <NavigationMenuItem className="list-none">
        <div className="h-6 w-px bg-border" />
      </NavigationMenuItem>

      <NavigationMenuItem>
        <NavigationMenuTrigger className="gap-2 text-xs h-9 px-3 bg-muted/50 hover:bg-muted data-[state=open]:bg-muted">
          <FolderKanban className="h-3.5 w-3.5 shrink-0" />
          <span className="leading-none">{project.name}</span>
        </NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="p-1 min-w-[200px] max-h-[400px] overflow-y-auto">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setProject(p)}
                  className={`w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent transition-colors whitespace-nowrap ${
                    project.id === p.id ? 'bg-accent font-semibold' : ''
                  }`}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    </>
  );
}
