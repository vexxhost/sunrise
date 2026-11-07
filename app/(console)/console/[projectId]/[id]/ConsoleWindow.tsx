"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type RFB from "@novnc/novnc";
import { ExternalLink, Keyboard, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { toNoVncWebSocketUrl } from "@/lib/openstack/console-url";
import { ThemeToggle } from "@/components/navigation/ThemeToggle";

interface ConsoleWindowProps {
  serverId: string;
  projectId: string;
  serverName: string;
  regionId: string;
  addresses?: Record<
    string,
    Array<{ addr: string; "OS-EXT-IPS:type"?: string; version?: number }>
  >;
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
      if ((a.version ?? 4) === version && a["OS-EXT-IPS:type"] === "floating")
        return a.addr;
    }
  }
  for (const list of Object.values(addresses)) {
    for (const a of list) {
      if ((a.version ?? 4) === version) return a.addr;
    }
  }
  return undefined;
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
  const [connectedUrl, setConnectedUrl] = useState<string | null>(null);
  const [confirmCtrlAltDelOpen, setConfirmCtrlAltDelOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rfbRef = useRef<RFB | null>(null);
  const vncTargetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${serverName} – Console`;
  }, [serverName]);

  useEffect(() => {
    if (protocol !== "vnc" || !url) return;

    const target = vncTargetRef.current;
    if (!target) return;

    let disposed = false;
    let client: RFB | null = null;

    setConnectedUrl(null);
    setError(null);
    target.replaceChildren();

    const onConnect = () => {
      if (disposed) return;
      setConnectedUrl(url);
      setError(null);
    };
    const onDisconnect = (event: CustomEvent<{ clean: boolean }>) => {
      if (disposed) return;
      setConnectedUrl(null);
      setError(
        event.detail.clean ? "Console disconnected" : "Console connection lost",
      );
    };
    const onCredentialsRequired = () => {
      if (!disposed) setError("Console credentials are required");
    };
    const onSecurityFailure = (
      event: CustomEvent<{ status: number; reason?: string }>,
    ) => {
      if (disposed) return;
      setError(event.detail.reason || "Console authentication failed");
    };

    const connect = async () => {
      try {
        const webSocketUrl = toNoVncWebSocketUrl(url);
        const { default: RFBClient } = await import("@novnc/novnc");
        if (disposed) return;

        client = new RFBClient(target, webSocketUrl);
        rfbRef.current = client;
        client.viewOnly = false;
        client.scaleViewport = true;
        // Nova/QEMU commonly rejects SetDesktopSize; fit the canvas locally.
        client.resizeSession = false;
        client.background = "#000";
        client.showDotCursor = true;
        client.addEventListener("connect", onConnect);
        client.addEventListener("disconnect", onDisconnect);
        client.addEventListener("credentialsrequired", onCredentialsRequired);
        client.addEventListener("securityfailure", onSecurityFailure);
      } catch (connectionError) {
        if (disposed) return;
        setError(
          connectionError instanceof Error
            ? connectionError.message
            : "Failed to initialize console",
        );
      }
    };

    void connect();

    return () => {
      disposed = true;
      if (rfbRef.current === client) rfbRef.current = null;
      if (client) {
        client.removeEventListener("connect", onConnect);
        client.removeEventListener("disconnect", onDisconnect);
        client.removeEventListener(
          "credentialsrequired",
          onCredentialsRequired,
        );
        client.removeEventListener("securityfailure", onSecurityFailure);
        client.disconnect();
      }
      target.replaceChildren();
    };
  }, [protocol, url]);

  const confirmCtrlAltDel = useCallback(() => {
    rfbRef.current?.sendCtrlAltDel();
    rfbRef.current?.focus();
    setConfirmCtrlAltDelOpen(false);
  }, []);

  const reconnect = () => {
    startTransition(async () => {
      setError(null);
      setConnectedUrl(null);
      try {
        // projectId is encoded in the URL purely so the operator can keep
        // multiple sessions open across projects in different popups; the
        // OpenStack call still scopes via the session's project token.
        void projectId;
        const r = await getRemoteConsoleAction(
          serverId,
          protocol,
          undefined,
          regionId,
        );
        setUrl(r.url);
        setRawUrl(r.rawUrl);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to reload console",
        );
      }
    });
  };

  const ipv4 = pickIp(addresses, 4);
  const canSendKeys =
    connectedUrl === url && url !== null && protocol === "vnc";

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground">
      <div className="flex-1 min-h-0 relative bg-black">
        {url && protocol === "vnc" ? (
          <>
            <div
              ref={vncTargetRef}
              className="absolute inset-0 overflow-hidden bg-black"
              aria-label={`VNC console for ${serverName}`}
            />
            {connectedUrl !== url && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black text-sm text-white/60">
                {error ?? "Connecting console…"}
              </div>
            )}
          </>
        ) : url ? (
          <iframe
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
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-t bg-background/95 text-xs shadow-[0_-1px_0_var(--border)]">
        <div className="flex items-center gap-6 truncate">
          <span>
            <span className="text-muted-foreground">SERVER:</span>{" "}
            <span className="font-medium">{serverName}</span>
          </span>
          {ipv4 && (
            <span>
              <span className="text-muted-foreground">IPV4:</span>{" "}
              <span className="font-medium">{ipv4}</span>
            </span>
          )}
          <span>
            <span className="text-muted-foreground">REGION:</span>{" "}
            <span className="font-medium">{regionId}</span>
          </span>
          <span className="uppercase text-muted-foreground">{protocol}</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirmCtrlAltDelOpen(true)}
            disabled={!canSendKeys}
            title={
              canSendKeys
                ? "Send Ctrl+Alt+Del to guest"
                : "Available once the VNC console is connected"
            }
            className="gap-2"
          >
            <Keyboard className="h-3.5 w-3.5" />
            Ctrl+Alt+Del
          </Button>
          {(rawUrl ?? url) && (
            <a
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
                className: "gap-2",
              })}
              href={rawUrl ?? url ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open raw
            </a>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={reconnect}
            className="gap-2"
            loading={isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reconnect
          </Button>
        </div>
      </div>
      <Dialog
        open={confirmCtrlAltDelOpen}
        onOpenChange={setConfirmCtrlAltDelOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Ctrl+Alt+Del?</DialogTitle>
            <DialogDescription>
              This sends Ctrl+Alt+Del to {serverName}. Depending on the guest
              operating system, it may reboot the instance or interrupt an
              active login session.
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
            <Button
              type="button"
              variant="destructive"
              onClick={confirmCtrlAltDel}
            >
              <Keyboard className="h-4 w-4" />
              Send Ctrl+Alt+Del
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
