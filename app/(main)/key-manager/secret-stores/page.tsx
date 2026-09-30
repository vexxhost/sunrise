import { DatabaseZap, KeyRound } from "lucide-react";

import { MutationAlert } from "@/components/mutations/MutationAlert";
import { DetailField, DetailSection } from "@/components/Instance/DetailFields";
import { Badge } from "@/components/ui/badge";
import {
  getBarbicanQuotaSummary,
  listSecretStores,
  listTransportKeys,
} from "@/lib/openstack/barbican-server";

export const dynamic = "force-dynamic";

function quotaValue(value: number) {
  if (value < 0) return "Unlimited";
  if (value === 0) return "Disabled";
  return new Intl.NumberFormat("en").format(value);
}

export default async function SecretStoresPage() {
  const [storeResult, quotaResult, transportKeyResult] = await Promise.all([
    listSecretStores(),
    getBarbicanQuotaSummary(),
    listTransportKeys(),
  ]);
  return (
    <div className="max-w-screen-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Access and Storage</h1>
        <p className="text-sm text-muted-foreground">
          Barbican storage backends and effective limits for the active project.
        </p>
      </div>
      <DetailSection title="Effective quotas">
        <div className="grid gap-px overflow-hidden bg-border sm:grid-cols-2 xl:grid-cols-5">
          {(
            ["secrets", "containers", "orders", "consumers", "cas"] as const
          ).map((name) => (
            <div
              key={name}
              className={`bg-background px-3 py-3 ${name === "cas" ? "sm:col-span-2 xl:col-span-1" : ""}`}
            >
              <div className="text-xs capitalize text-muted-foreground">
                {name === "cas" ? "Certificate authorities" : name}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {quotaValue(quotaResult.limits[name])}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {quotaResult.usage[name] === null
                  ? "Usage unavailable from the standard API"
                  : `${quotaResult.usage[name]} used`}
              </div>
            </div>
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Secret stores">
        {storeResult.status === "available" ? (
          storeResult.stores.length ? (
            <div className="divide-y">
              {storeResult.stores.map((store) => (
                <div
                  key={store.id}
                  className="grid gap-3 px-3 py-4 md:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/30">
                      <DatabaseZap className="size-4 text-muted-foreground" />
                    </span>
                    <div>
                      <div className="font-medium">{store.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {store.id}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DetailField label="Status">
                      <Badge
                        variant={
                          store.status === "ACTIVE" ? "secondary" : "outline"
                        }
                      >
                        {store.status}
                      </Badge>
                    </DetailField>
                    <DetailField label="Default">
                      {store.global_default
                        ? "Global default"
                        : "Available backend"}
                    </DetailField>
                    <DetailField label="Store plugin">
                      {store.secret_store_plugin || "-"}
                    </DetailField>
                    <DetailField label="Crypto plugin">
                      {store.crypto_plugin || "-"}
                    </DetailField>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No secret stores were returned.
            </p>
          )
        ) : (
          <MutationAlert variant="warning">
            {storeResult.status === "forbidden"
              ? "Secret-store discovery requires a project administrator role. Secret lifecycle operations remain available according to Barbican policy."
              : "This Barbican deployment does not expose multiple secret-store backends."}
          </MutationAlert>
        )}
      </DetailSection>
      <DetailSection title="Transport keys">
        <p className="border-b px-3 py-3 text-sm text-muted-foreground">
          Public wrapping-key references advertised by Barbican plugins for
          client-side secret transport. Lifecycle is controlled by cloud
          operators, so Sunrise exposes these records read-only.
        </p>
        {transportKeyResult.status === "available" ? (
          transportKeyResult.items.length ? (
            <div className="divide-y">
              {transportKeyResult.items.map((transportKey) => (
                <div
                  key={transportKey.id}
                  className="flex min-w-0 items-start gap-3 px-3 py-4"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/30">
                    <KeyRound className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-sm">{transportKey.id}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {transportKey.transport_key_ref}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-6 text-sm text-muted-foreground">
              No transport keys were returned by Barbican.
            </p>
          )
        ) : (
          <MutationAlert variant="warning">
            {transportKeyResult.status === "forbidden"
              ? "Transport-key discovery requires additional Barbican permission."
              : "This Barbican deployment does not expose transport keys."}
          </MutationAlert>
        )}
      </DetailSection>
    </div>
  );
}
