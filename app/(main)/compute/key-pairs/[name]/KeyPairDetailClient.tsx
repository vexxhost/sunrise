"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";

import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { Badge } from "@/components/ui/badge";
import { keypairQueryOptions } from "@/hooks/queries/useServers";

interface KeyPairDetailClientProps {
  name: string;
  projectId?: string;
  regionId?: string;
}

export function KeyPairDetailClient({
  name,
  projectId,
  regionId,
}: KeyPairDetailClientProps) {
  const { data: keyPair } = useSuspenseQuery(
    keypairQueryOptions(regionId, projectId, name),
  );

  return (
    <div className="max-w-screen-xl space-y-6">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/30">
          <KeyRound className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {keyPair.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Public key registered for instance access
          </p>
        </div>
      </div>

      <DetailSection title="Key pair">
        <DetailField label="Name">{keyPair.name}</DetailField>
        <DetailField label="Type">
          <Badge variant="outline">{keyPair.type.toUpperCase()}</Badge>
        </DetailField>
        <DetailField label="Fingerprint" className="font-mono text-xs">
          {keyPair.fingerprint}
        </DetailField>
        <DetailField label="Public key">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-sm bg-muted/40 p-3 font-mono text-xs">
            {keyPair.public_key}
          </pre>
        </DetailField>
        <DetailField label="Created">{keyPair.created_at || "-"}</DetailField>
        <DetailField label="User ID" className="font-mono text-xs">
          {keyPair.user_id || "-"}
        </DetailField>
      </DetailSection>
    </div>
  );
}
