"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ExternalLink, Keyboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getRemoteConsoleAction,
  type ConsoleProtocol,
} from "@/lib/openstack/console-actions";

interface ConsoleWindowProps {
  serverId: string;
  projectId: string;
  serverName: string;
  regionId: string;
  addresses?: Record<string, Array<{ addr: string; "OS-EXT-IPS:type"?: string; version?: number }>>;
  protocol: ConsoleProtocol;
  initialUrl: string | null;
  initialRawUrl: string | null;
  initialError: string | null;
}

function pickIp(
  addresses: ConsoleWindowProps["addresses"],
  version: number,
): string | undefined {
  if (!addresses) return undefined;
  for (const list of Object.values(addresses)) {
    for (const a of list) {
      if ((a.version ?? 4) === version && a["OS-EXT-IPS:type"] === "floating") return a.addr;
    }
  }
  for (const list of Object.values(addresses)) {
    for (const a of list) {
      if ((a.version ?? 4) === version) return a.addr;
    }
  }
  return undefined;
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function ConsoleWindow({
  serverId,
  projectId,
  serverName,
  regionId,
  addresses,
  protocol,
  initialUrl,
  initialRawUrl,
  initialError,
}: ConsoleWindowProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [rawUrl, setRawUrl] = useState<string | null>(initialRawUrl);
  const [error, setError] = useState<string | null>(initialError);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [confirmCtrlAltDelOpen, setConfirmCtrlAltDelOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const proxyOrigin = useMemo(() => originOf(url), [url]);

  useEffect(() => {
    document.title = `${serverName} – Console`;
  }, [serverName]);

  // ---- postMessage bridge -------------------------------------------------
  // sunrise.html (deployed alongside noVNC via ConfigMap) posts
  //   { type: 'sunrise:ready' }   when RFB is initialized
  //   { type: 'sunrise:pong'  }   in reply to ping
  //
  // CAVEATS:
  // - For this to work, sunrise.html MUST be served from the same origin as
  //   the Nova noVNC proxy and MUST allow our dashboard origin in its
  //   `data-parents` (or `SUNRISE_ALLOWED_PARENTS`) list. Otherwise
  //   sunrise.html's listener will silently drop our messages.
  // - We always send with a strict targetOrigin (the proxy origin) — never '*'
  //   — so a hijacked iframe location can't receive Ctrl+Alt+Del.
  // - If a strict CSP on the noVNC proxy blocks the inline module script in
  //   sunrise.html, no `sunrise:ready` arrives and the button stays disabled.
  useEffect(() => {
    setBridgeReady(false);
    if (!proxyOrigin) return;

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== proxyOrigin) return;
      const data = e.data as { type?: string } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "sunrise:ready" || data.type === "sunrise:pong") {
        setBridgeReady(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [proxyOrigin, url]);

  const postToConsole = useCallback(
    (message: Record<string, unknown>) => {
      if (!proxyOrigin) return;
      iframeRef.current?.contentWindow?.postMessage(message, proxyOrigin);
    },
    [proxyOrigin],
  );

  const confirmCtrlAltDel = useCallback(() => {
    postToConsole({ type: "sunrise:ctrlAltDel" });
    setConfirmCtrlAltDelOpen(false);
  }, [postToConsole]);

  const reconnect = () => {
    startTransition(async () => {
      setError(null);
      setBridgeReady(false);
      try {
        // projectId is encoded in the URL purely so the operator can keep
        // multiple sessions open across projects in different popups; the
        // OpenStack call still scopes via the session's project token.
        void projectId;
        const r = await getRemoteConsoleAction(serverId, protocol, undefined, regionId);
        setUrl(r.url);
        setRawUrl(r.rawUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reload console");
      }
    });
  };

  const ipv4 = pickIp(addresses, 4);
  const canSendKeys = bridgeReady && protocol === "vnc";

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white">
      <div className="flex-1 min-h-0 relative">
        {url ? (
          <iframe
            ref={iframeRef}
            key={url}
            src={url}
            title={`${protocol} console for ${serverName}`}
            className="absolute inset-0 w-full h-full border-0 bg-black"
            // Required for the user to paste into the guest from the host
            // clipboard. Browsers also need a user gesture inside the iframe.
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
            {error ?? "Loading console…"}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-white/10 bg-zinc-900 text-xs">
        <div className="flex items-center gap-6 truncate">
          <span>
            <span className="text-white/50">SERVER:</span>{" "}
            <span className="font-medium">{serverName}</span>
          </span>
          {ipv4 && (
            <span>
              <span className="text-white/50">IPV4:</span>{" "}
              <span className="font-medium">{ipv4}</span>
            </span>
          )}
          <span>
            <span className="text-white/50">REGION:</span>{" "}
            <span className="font-medium">{regionId}</span>
          </span>
          <span className="uppercase text-white/40">{protocol}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirmCtrlAltDelOpen(true)}
            disabled={!canSendKeys}
            title={
              canSendKeys
                ? "Send Ctrl+Alt+Del to guest"
                : "Available once the patched sunrise.html console is loaded (VNC only)"
            }
            className="gap-2"
          >
            <Keyboard className="h-3.5 w-3.5" />
            Ctrl+Alt+Del
          </Button>
          {(rawUrl ?? url) && (
            <Button asChild size="sm" variant="secondary" className="gap-2">
              <a href={rawUrl ?? url ?? "#"} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="h-3.5 w-3.5" />
                Open raw
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={reconnect}
            disabled={isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
            Reconnect
          </Button>
        </div>
      </div>
      <Dialog open={confirmCtrlAltDelOpen} onOpenChange={setConfirmCtrlAltDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Ctrl+Alt+Del?</DialogTitle>
            <DialogDescription>
              This sends Ctrl+Alt+Del to {serverName}. Depending on the guest operating
              system, it may reboot the instance or interrupt an active login session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmCtrlAltDelOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmCtrlAltDel}>
              <Keyboard className="h-4 w-4" />
              Send Ctrl+Alt+Del
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
