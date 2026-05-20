"use client";

import { useState } from "react";
import { ExternalLink, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConsoleProtocol } from "@/lib/openstack/console-actions";

interface ConsoleProps {
  serverId: string;
  projectId?: string;
  regionId?: string;
}

const PROTOCOLS: ConsoleProtocol[] = ["vnc", "serial"];

export function Console({ serverId, projectId, regionId }: ConsoleProps) {
  const [protocol, setProtocol] = useState<ConsoleProtocol>("vnc");

  // Project segment lets the operator open consoles in multiple projects
  // simultaneously (each popup gets a unique window name keyed by both ids).
  const projectSegment = projectId ?? "default";
  const consoleHref =
    `/console/${projectSegment}/${serverId}` +
    `?protocol=${protocol}${regionId ? `&region=${regionId}` : ""}`;

  const openPopup = () => {
    const features =
      "popup=yes,width=960,height=600,menubar=no,toolbar=no,location=no,status=no";
    window.open(consoleHref, `console-${projectSegment}-${serverId}`, features);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Protocol</h3>
        <div className="flex gap-1">
          {PROTOCOLS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={protocol === p ? "default" : "outline"}
              onClick={() => setProtocol(p)}
            >
              {p.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={openPopup} className="gap-2">
          <Monitor className="h-4 w-4" />
          Launch console
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <a href={consoleHref} target="_blank" rel="noreferrer noopener">
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        The console opens in a separate window. Tokens are short-lived and single-use — use Reconnect inside
        the console window to get a fresh session.
      </p>
    </div>
  );
}
