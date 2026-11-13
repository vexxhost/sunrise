import { DirectClient } from "../../DirectClient";
import { ObjectStorageAuthRedirect } from "@/components/Auth/ObjectStorageAuthRedirect";
import { DataTableHeader } from "@/components/DataTable/Header";
import { requireS3Backend } from "@/components/services/ServiceGuards";
import { s3DirectBrowser } from "@/lib/s3/browser-mode";
import { s3BrowserStorageIdentityScope } from "@/lib/s3/browser-storage-scope";
import {
  getActiveS3Credentials,
  getSession,
  normalizeProjectId,
} from "@/lib/session";

interface PageProps {
  params: Promise<{ bucket: string; key: string[] }>;
}

export default async function Page({ params }: PageProps) {
  await requireS3Backend();
  const { bucket: rawBucket, key: rawKeyParts } = await params;
  const bucket = decodeURIComponent(rawBucket);
  const objectKey = rawKeyParts
    .map((part) => decodeURIComponent(part))
    .join("/");

  const session = await getSession();
  const creds = getActiveS3Credentials(session);
  const activeProjectId = normalizeProjectId(session.projectId);
  const activeRegionId = session.regionId ?? "";

  if (!creds) {
    return <ObjectStorageAuthRedirect />;
  }

  return (
    <>
      <DataTableHeader resourceName="object" actions={undefined} />
      <DirectClient
        activeProjectId={activeProjectId}
        activeRegionId={activeRegionId}
        browserStorageIdentityScope={s3BrowserStorageIdentityScope(session)}
        bucket={bucket}
        objectKey={objectKey}
        showServerBrowserMode={!s3DirectBrowser()}
      />
    </>
  );
}
