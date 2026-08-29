import type { ReactNode } from 'react';
import { FolderKanban, MapPin } from 'lucide-react';

export function ProjectContextHeader({
  title,
  description,
  projectName,
  regionName,
  actions,
}: {
  title: string;
  description?: string;
  projectName: string;
  regionName: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <FolderKanban className="size-4 shrink-0" />
            <span className="truncate font-medium text-foreground">
              {projectName}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" />
            {regionName}
          </span>
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
