'use server';

import { openstack } from '@/lib/openstack/actions';
import { getSession } from '@/lib/session';

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
 * Rewrite Nova-issued noVNC URLs to point at our patched `sunrise.html` page
 * deployed alongside the noVNC assets in the nova-novncproxy pod (mounted via
 * ConfigMap with `subPath`, so upstream `vnc.html` / `vnc_lite.html` stay intact).
 *
 * Only the path is rewritten; the `?path=...token=...` query is preserved
 * verbatim so websockify auth still works.
 *
 * CAVEATS:
 * - The proxy must serve `sunrise.html` at the same origin as the websocket
 *   endpoint. If the file is missing the iframe will 404 — fall back to rawUrl.
 * - The proxy origin must allow framing from the dashboard origin
 *   (no `X-Frame-Options: DENY`, permissive `Content-Security-Policy:
 *   frame-ancestors`).
 * - sunrise.html itself loads Inter from fonts.googleapis.com; if the proxy
 *   has a strict CSP we either relax `font-src`/`style-src` or self-host the
 *   font in the same ConfigMap.
 */
function rewriteToSunrise(originalUrl: string): string {
  try {
    const u = new URL(originalUrl);
    if (u.pathname.endsWith('/vnc_lite.html') || u.pathname.endsWith('/vnc.html')) {
      u.pathname = u.pathname.replace(/(vnc_lite|vnc)\.html$/, 'sunrise.html');
      return u.toString();
    }
    return originalUrl;
  } catch {
    return originalUrl;
  }
}

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
  const url = protocol === 'vnc' ? rewriteToSunrise(rawUrl) : rawUrl;
  return { ...remote, url, rawUrl };
}
