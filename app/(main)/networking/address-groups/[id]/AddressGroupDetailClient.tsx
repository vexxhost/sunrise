"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ListTree } from "lucide-react";

import {
  AddressGroupAddressActions,
  AddressGroupDetailActions,
} from "@/components/Network/AddressGroupDetailActions";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { addressGroupQueryOptions } from "@/hooks/queries/useNetworks";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

export function AddressGroupDetailClient({
  id,
  owned,
  projectId,
  regionId,
}: {
  id: string;
  owned: boolean;
  projectId: string;
  regionId: string;
}) {
  const group = useSuspenseQuery(
    addressGroupQueryOptions(regionId, projectId, id),
  );
  const optionalMetadata: Array<readonly [string, string | number]> = [];
  if (group.data.created_at) {
    optionalMetadata.push(["Created", group.data.created_at]);
  }
  if (group.data.updated_at) {
    optionalMetadata.push(["Updated", group.data.updated_at]);
  }
  if (group.data.revision_number !== undefined) {
    optionalMetadata.push(["Revision", group.data.revision_number]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ListTree className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {group.data.name || group.data.id}
            </h2>
            {!owned ? <Badge variant="outline">Shared</Badge> : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {group.data.description || "No description"}
          </p>
        </div>
        {owned ? (
          <AddressGroupDetailActions
            group={group.data}
            projectId={projectId}
            regionId={regionId}
          />
        ) : (
          <Badge variant="outline">Read-only context</Badge>
        )}
      </div>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Addresses</h3>
          <Badge variant="outline">{group.data.addresses.length}</Badge>
        </div>
        {group.data.addresses.length ? (
          <div className="divide-y rounded-md border">
            {group.data.addresses.map((address) => (
              <div
                key={address}
                className="flex min-h-11 items-center justify-between gap-3 px-3 py-2"
              >
                <span className="break-all font-mono text-sm">{address}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <CopyButton value={address} label="Copy address" />
                  {owned ? (
                    <AddressGroupAddressActions
                      address={address}
                      groupId={group.data.id}
                      projectId={projectId}
                      regionId={regionId}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No addresses are configured.
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Metadata</h3>
        <div className="divide-y rounded-md border">
          <DetailRow label="ID" value={group.data.id} />
          <DetailRow
            label="Project ID"
            value={
              group.data.project_id || group.data.tenant_id || "Not reported"
            }
          />
          {optionalMetadata.map(([label, value]) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </div>
      </section>
    </div>
  );
}
