"use server";

import { openstackRequest } from "@/lib/openstack/request-server";
import { getSession } from "@/lib/session";

export type ConsoleProtocol = "vnc" | "serial";
export type ConsoleType = "novnc" | "xvpvnc" | "serial";

export interface RemoteConsole {
  protocol: ConsoleProtocol;
  type: ConsoleType;
  /** Original URL returned by Nova. VNC clients derive the WebSocket URL from it. */
  url: string;
  /** Original, unmodified URL Nova returned. Use this for "Open raw". */
  rawUrl: string;
}

const DEFAULTS: Record<ConsoleProtocol, ConsoleType> = {
  vnc: "novnc",
  serial: "serial",
};

export async function getRemoteConsoleAction(
  serverId: string,
  protocol: ConsoleProtocol = "vnc",
  type?: ConsoleType,
  regionId?: string,
): Promise<RemoteConsole> {
  const session = await getSession();
  const resolvedRegion = regionId ?? session.regionId;

  if (!resolvedRegion) {
    throw new Error("No region available for console request");
  }

  const data = await openstackRequest<{ remote_console: RemoteConsole }>({
    regionId: resolvedRegion,
    serviceType: "compute",
    serviceName: "nova",
    path: `/servers/${serverId}/remote-consoles`,
    method: "POST",
    apiVersion: "compute 2.79",
    body: {
      remote_console: {
        protocol,
        type: type ?? DEFAULTS[protocol],
      },
    },
  });

  if (!data) {
    throw new Error(`Failed to fetch ${protocol} console`);
  }

  const remote = data.remote_console;
  const rawUrl = remote.url;
  return { ...remote, rawUrl };
}
