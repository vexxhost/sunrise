import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OverviewRefreshButton } from '@/components/overview/OverviewRefreshButton';
import { ProjectContextHeader } from '@/components/overview/ProjectContextHeader';
import { QuotaExplorer } from '@/components/quotas/QuotaExplorer';
import { QuotaSkeleton } from '@/components/quotas/QuotaSkeleton';
import { loadCloudContext } from '@/lib/cloud-context';
import { loadProjectOverview } from '@/lib/openstack/overview';

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
  const cloud = await loadCloudContext();
  const { snapshot } = cloud;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <ProjectContextHeader
        title="Quotas"
        description="Review the limits and effective resource consumption reported for this project."
        context={snapshot}
        actions={<OverviewRefreshButton />}
      />

      <Suspense
        key={`${snapshot.project.id ?? 'none'}:${snapshot.region.id ?? 'none'}`}
        fallback={<QuotaSkeleton />}
      >
        <QuotaData
          token={cloud.keystoneToken}
          regionId={snapshot.region.id ?? undefined}
          projectId={snapshot.project.id ?? undefined}
        />
      </Suspense>
    </div>
  );
}
