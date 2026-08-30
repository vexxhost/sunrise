'use server';

import { openstack } from '@/lib/openstack/actions';
import { getSession } from '@/lib/session';
import { rewriteNoVncUrl } from '@/lib/openstack/console-url';

export type ConsoleProtocol = 'vnc' | 'serial';
export type ConsoleType = 'novnc' | 'xvpvnc' | 'serial';

export interface RemoteConsole {
  protocol: ConsoleProtocol;
  type: ConsoleType;
  /** URL to render in the dashboard (rewritten to sunrise.html when applicable). */
  url: string;
  /** Original, unmodified URL Nova returned. Use this for "Open raw". */
  rawUrl: string;
}

const DEFAULTS: Record<ConsoleProtocol, ConsoleType> = {
  vnc: 'novnc',
  serial: 'serial',
};

/**
 * Nova-issued noVNC URLs are rewritten to the small Sunrise page deployed
 * alongside the upstream assets. The token query remains intact, and the
 * configured dashboard origin is included for the postMessage bridge.
 *
 * CAVEATS:
 * - The proxy must serve `sunrise.html` at the same origin as the websocket
 *   endpoint. If the file is missing the iframe will 404 — fall back to rawUrl.
 * - The proxy origin must allow framing from the dashboard origin
 *   (no `X-Frame-Options: DENY`, permissive `Content-Security-Policy:
 *   frame-ancestors`).
 */
export async function getRemoteConsoleAction(
  serverId: string,
  protocol: ConsoleProtocol = 'vnc',
  type?: ConsoleType,
  regionId?: string,
): Promise<RemoteConsole> {
  const session = await getSession();
  const resolvedRegion = regionId ?? session.regionId;

  if (!resolvedRegion) {
    throw new Error('No region available for console request');
  }

  const data = await openstack<{ remote_console: RemoteConsole }>({
    regionId: resolvedRegion,
    serviceType: 'compute',
    serviceName: 'nova',
    path: `/servers/${serverId}/remote-consoles`,
    method: 'POST',
    apiVersion: 'compute 2.79',
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
  const url = protocol === 'vnc'
    ? rewriteNoVncUrl(rawUrl, process.env.DASHBOARD_URL)
    : rawUrl;
  return { ...remote, url, rawUrl };
}
