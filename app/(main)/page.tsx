import { Suspense } from 'react';
import { OverviewDashboard } from '@/components/overview/OverviewDashboard';
import { OverviewRefreshButton } from '@/components/overview/OverviewRefreshButton';
import { OverviewSkeleton } from '@/components/overview/OverviewSkeleton';
import { ProjectContextHeader } from '@/components/overview/ProjectContextHeader';
import { readPrefs } from '@/lib/prefs';
import { getServiceCatalog } from '@/lib/openstack/catalog';
import { loadOperationalFeed } from '@/lib/openstack/operational-feed';
import { compileOperationalFeed } from '@/lib/openstack/operational';
import { loadProjectOverview } from '@/lib/openstack/overview';
import { buildServiceDirectory } from '@/lib/openstack/service-directory';
import { getSession, normalizeProjectId } from '@/lib/session';

async function OverviewData({
  token,
  regionId,
  projectId,
  credentialExpiration,
}: {
  token?: string;
  regionId?: string;
  projectId?: string;
  credentialExpiration?: number;
}) {
  const catalog = token ? await getServiceCatalog(token) : null;
  const [services, resourceFeed] = await Promise.all([
    loadProjectOverview({ token, regionId, projectId, catalog }),
    loadOperationalFeed({ token, regionId, projectId, catalog }),
  ]);
  const operationalFeed = compileOperationalFeed({
    services,
    resourceFeed,
    credentialExpiration,
  });
  const serviceDirectory = buildServiceDirectory(catalog, regionId);

  return (
    <OverviewDashboard
      services={services}
      operationalFeed={operationalFeed}
      serviceDirectory={serviceDirectory}
    />
  );
}

export default async function Page() {
  const [session, prefs] = await Promise.all([getSession(), readPrefs()]);
  const projectName =
    prefs.projectId === session.projectId && prefs.projectName
      ? prefs.projectName
      : session.projectId ?? 'No project selected';
  const regionName = session.regionId ?? 'No region selected';
  const credentialExpiration =
    normalizeProjectId(session.s3Credentials?.projectId) ===
    normalizeProjectId(session.projectId)
      ? session.s3Credentials?.expiration
      : undefined;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
      <ProjectContextHeader
        title="Overview"
        projectName={projectName}
        regionName={regionName}
        actions={<OverviewRefreshButton />}
      />

      <Suspense
        key={`${session.projectId ?? 'none'}:${session.regionId ?? 'none'}`}
        fallback={<OverviewSkeleton />}
      >
        <OverviewData
          token={session.keystoneProjectToken}
          regionId={session.regionId}
          projectId={session.projectId}
          credentialExpiration={credentialExpiration}
        />
      </Suspense>
    </div>
  );
}
