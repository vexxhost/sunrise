import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OverviewRefreshButton } from '@/components/overview/OverviewRefreshButton';
import { ProjectContextHeader } from '@/components/overview/ProjectContextHeader';
import { QuotaExplorer } from '@/components/quotas/QuotaExplorer';
import { QuotaSkeleton } from '@/components/quotas/QuotaSkeleton';
import { loadProjectOverview } from '@/lib/openstack/overview';
import { readPrefs } from '@/lib/prefs';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Quotas',
};

async function QuotaData({
  token,
  regionId,
  projectId,
}: {
  token?: string;
  regionId?: string;
  projectId?: string;
}) {
  const services = await loadProjectOverview({ token, regionId, projectId });
  return <QuotaExplorer services={services} />;
}

export default async function QuotasPage() {
  const [session, prefs] = await Promise.all([getSession(), readPrefs()]);
  const projectName =
    prefs.projectId === session.projectId && prefs.projectName
      ? prefs.projectName
      : session.projectId ?? 'No project selected';
  const regionName = session.regionId ?? 'No region selected';

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <ProjectContextHeader
        title="Quotas"
        description="Review the limits and effective resource consumption reported for this project."
        projectName={projectName}
        regionName={regionName}
        actions={<OverviewRefreshButton />}
      />

      <Suspense
        key={`${session.projectId ?? 'none'}:${session.regionId ?? 'none'}`}
        fallback={<QuotaSkeleton />}
      >
        <QuotaData
          token={session.keystoneProjectToken}
          regionId={session.regionId}
          projectId={session.projectId}
        />
      </Suspense>
    </div>
  );
}
