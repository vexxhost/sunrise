"use client";

import { useRef, useState } from "react";
import { Check, Copy, Eye } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { BARBICAN_PAYLOAD_LIMIT_BYTES } from "@/lib/openstack/barbican-input";
import {
  presentBarbicanPayload,
  type BarbicanPayloadPresentation,
} from "@/lib/openstack/barbican-payload";

type RevealedPayload = BarbicanPayloadPresentation & { contentType: string };

function responseError(value: unknown) {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  return typeof value.error === "string" ? value.error : null;
}

export function SecretPayloadRevealDialog({
  projectId,
  regionId,
  secretId,
}: {
  projectId: string;
  regionId: string;
  secretId: string;
}) {
  const abortRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [payload, setPayload] = useState<RevealedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const clear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
    setPayload(null);
    setError(null);
    setCopied(false);
  };

  const reveal = async () => {
    if (pending || payload) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/key-manager/secrets/${encodeURIComponent(secretId)}/payload?disposition=inline`,
        {
          cache: "no-store",
          headers: {
            "X-Sunrise-Project-Id": projectId,
            "X-Sunrise-Region-Id": regionId,
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(
          responseError(result) ?? "The secret payload could not be revealed.",
        );
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > BARBICAN_PAYLOAD_LIMIT_BYTES) {
        setError(
          "This payload is too large to reveal safely. Download it instead.",
        );
        return;
      }
      const contentType =
        response.headers.get("content-type") ?? "application/octet-stream";
      setPayload({
        ...presentBarbicanPayload(bytes, contentType),
        contentType,
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError")
        return;
      setError("Key Manager could not be reached. Try again shortly.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
    }
  };

  const copy = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(
        "The payload could not be copied. Select the value manually instead.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) clear();
      }}
    >
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="size-4" />
        View payload
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Secret payload</DialogTitle>
          <DialogDescription>
            Reveal the protected value in this browser without downloading a
            file.
          </DialogDescription>
        </DialogHeader>

        {!payload ? (
          <MutationAlert variant="warning" title="Sensitive value">
            The payload is fetched only after you confirm and is cleared when
            this dialog closes. It is not stored in Sunrise page data or query
            caches.
          </MutationAlert>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {payload.encoding === "text" ? "Text" : "Base64"}
              </Badge>
              <span>{payload.contentType}</span>
              <span>{payload.size.toLocaleString("en")} bytes</span>
            </div>
            <Textarea
              aria-label="Revealed secret payload"
              className="max-h-[55vh] min-h-64 resize-y font-mono text-xs"
              readOnly
              spellCheck={false}
              value={payload.content}
            />
            {payload.encoding === "base64" ? (
              <p className="text-xs text-muted-foreground">
                Binary payloads are represented as base64 so they can be viewed
                and copied without corrupting bytes.
              </p>
            ) : null}
          </div>
        )}

        {error ? <MutationAlert>{error}</MutationAlert> : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
          {payload ? (
            <Button type="button" onClick={copy}>
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy payload"}
            </Button>
          ) : (
            <Button type="button" disabled={pending} onClick={reveal}>
              {pending ? <Spinner /> : <Eye className="size-4" />}
              {pending ? "Revealing" : "Reveal payload"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
