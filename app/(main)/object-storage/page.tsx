import { Database, KeyRound, ShieldCheck, UserRoundCheck } from "lucide-react";
import { ObjectStorageAuthRedirect } from "@/components/Auth/ObjectStorageAuthRedirect";
import {
  ServiceLandingPage,
  ServiceLandingSection,
  ServiceRecentResources,
  ServiceResourceGrid,
  type ServiceLandingMetric,
} from "@/components/service-landing/ServiceLanding";
import { loadCloudContext } from "@/lib/cloud-context";
import { listBucketsForRender } from "@/lib/s3/actions";
import { listRolesForRender } from "@/lib/s3/role-actions";
import { RoleDetailsDialog } from "./RoleDetailsDialog";

export const dynamic = "force-dynamic";

export default async function ObjectStoragePage() {
  const [cloud, bucketResult, roleResult] = await Promise.all([
    loadCloudContext(),
    listBucketsForRender(),
    listRolesForRender(),
  ]);
  const { snapshot } = cloud;
  const resources = [
    ...snapshot.personalResources.pinned,
    ...snapshot.personalResources.recent,
  ];

  if (
    (!bucketResult.ok && bucketResult.needsAuth) ||
    (!roleResult.ok && roleResult.needsAuth)
  ) {
    return <ObjectStorageAuthRedirect />;
  }

  const bucketCount = bucketResult.ok ? bucketResult.buckets.length : null;
  const roleCount = roleResult.ok ? roleResult.roles.length : null;
  const bucketRestricted = bucketResult.ok
    ? Boolean(bucketResult.accessDenied)
    : true;
  const roleRestricted = roleResult.ok ? roleResult.accessDenied : true;
  const bucketError = bucketResult.ok ? null : bucketResult.error;
  const roleError = roleResult.ok ? null : roleResult.error;
  const metrics: ServiceLandingMetric[] = [
    {
      icon: Database,
      label: "Buckets",
      value: bucketCount === null ? "-" : String(bucketCount),
      detail: bucketError ?? "Buckets in the active RGW account",
    },
    {
      icon: ShieldCheck,
      label: "Access roles",
      value: roleCount === null ? "-" : String(roleCount),
      detail: roleError ?? "IAM roles visible to the current session",
    },
    {
      icon: UserRoundCheck,
      label: "Bucket access",
      value: bucketRestricted ? "Restricted" : "Available",
      detail: bucketError ?? "S3 list access for the active project",
    },
    {
      icon: KeyRound,
      label: "Role access",
      value: roleRestricted ? "Restricted" : "Available",
      detail: roleError ?? "RGW IAM list access for the active project",
    },
  ];

  return (
    <ServiceLandingPage
      title="Object Storage"
      description="Browse S3-compatible buckets and objects, and inspect the RGW role used by the active project."
      context={snapshot}
      serviceId="object-storage"
      actions={<RoleDetailsDialog />}
      metrics={metrics}
    >
      <ServiceLandingSection
        title="Quick access"
        description="Open storage resources available through the current RGW credentials."
      >
        <ServiceResourceGrid
          resources={[
            {
              name: "Buckets",
              href: "/object-storage/buckets",
              icon: Database,
              description:
                "Browse buckets and manage objects through server or direct browser mode.",
              meta:
                bucketCount === null
                  ? (bucketError ?? "Count unavailable")
                  : `${bucketCount} visible`,
              badge: bucketRestricted ? "Restricted" : "Available",
            },
            {
              name: "Access roles",
              href: "/object-storage/roles",
              icon: ShieldCheck,
              description:
                "Inspect IAM roles, trust policies, and permissions in the active RGW account.",
              meta:
                roleCount === null
                  ? (roleError ?? "Count unavailable")
                  : `${roleCount} visible`,
              badge: roleRestricted ? "Restricted" : "Available",
            },
          ]}
        />
      </ServiceLandingSection>

      <ServiceRecentResources
        resources={resources}
        kinds={["bucket"]}
        emptyMessage="No pinned or recently viewed buckets in this project."
      />
    </ServiceLandingPage>
  );
}
