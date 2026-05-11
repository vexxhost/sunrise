import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { openstack } from "@/lib/openstack/actions";
import { getRemoteConsoleAction, type ConsoleProtocol } from "@/lib/openstack/console-actions";
import type { ServerResponse } from "@/types/openstack";
import { ConsoleWindow } from "./ConsoleWindow";

export const metadata = {
  title: "Console",
};

interface ConsolePageProps {
  params: Promise<{ projectId: string; id: string }>;
  searchParams: Promise<{ protocol?: ConsoleProtocol; region?: string }>;
}

export default async function ConsolePage({ params, searchParams }: ConsolePageProps) {
  const { projectId, id } = await params;
  const { protocol = "vnc", region } = await searchParams;

  const session = await getSession();
  const regionId = region ?? session.regionId;
  if (!regionId) notFound();

  const serverData = await openstack<ServerResponse>({
    regionId,
    serviceType: "compute",
    serviceName: "nova",
    path: `/servers/${id}`,
    apiVersion: "compute 2.79",
  });

  if (!serverData) notFound();

  let consoleUrl: string | null = null;
  let consoleRawUrl: string | null = null;
  let consoleError: string | null = null;
  try {
    const remote = await getRemoteConsoleAction(id, protocol, undefined, regionId);
    consoleUrl = remote.url;
    consoleRawUrl = remote.rawUrl;
  } catch (err) {
    consoleError = err instanceof Error ? err.message : "Failed to open console";
  }

  return (
    <ConsoleWindow
      serverId={id}
      projectId={projectId}
      serverName={serverData.server.name}
      regionId={regionId}
      addresses={serverData.server.addresses}
      protocol={protocol}
      initialUrl={consoleUrl}
      initialRawUrl={consoleRawUrl}
      initialError={consoleError}
    />
  );
}
