import { Suspense } from 'react';
import { FolderKanban, MapPin } from 'lucide-react';
import { OverviewDashboard } from '@/components/overview/OverviewDashboard';
import { OverviewRefreshButton } from '@/components/overview/OverviewRefreshButton';
import { OverviewSkeleton } from '@/components/overview/OverviewSkeleton';
import { readPrefs } from '@/lib/prefs';
import { getSession } from '@/lib/session';
import { loadProjectOverview } from '@/lib/openstack/overview';

async function OverviewData({
  token,
  regionId,
  projectId,
}: {
  token?: string;
  regionId?: string;
  projectId?: string;
}) {
  const services = await loadProjectOverview({ token, regionId, projectId });
  return <OverviewDashboard services={services} />;
}

export default async function Page() {
  const [session, prefs] = await Promise.all([getSession(), readPrefs()]);
  const projectName =
    prefs.projectId === session.projectId && prefs.projectName
      ? prefs.projectName
      : session.projectId ?? 'No project selected';
  const regionName = session.regionId ?? 'No region selected';

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <FolderKanban className="size-4 shrink-0" />
              <span className="truncate font-medium text-foreground">{projectName}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />
              {regionName}
            </span>
          </div>
        </div>
        <OverviewRefreshButton />
      </header>

      <Suspense
        key={`${session.projectId ?? 'none'}:${session.regionId ?? 'none'}`}
        fallback={<OverviewSkeleton />}
      >
        <OverviewData
          token={session.keystoneProjectToken}
          regionId={session.regionId}
          projectId={session.projectId}
        />
      </Suspense>
    </div>
  );
}
