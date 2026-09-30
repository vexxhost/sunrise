import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { normalizeAuthReturnTo } from "@/lib/auth-return";
import { objectStorageAuthRefreshHref } from "@/lib/s3/auth-navigation";

export default async function ObjectStorageAuthUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = normalizeAuthReturnTo(
    Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo,
  );

  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-xl flex-col justify-center py-12">
      <AlertTriangle
        aria-hidden="true"
        className="size-8 text-status-warning"
      />
      <p className="mt-5 text-sm font-medium text-status-warning">
        Object Storage session unavailable
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">
        Access could not be renewed
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
        Sunrise could not exchange the current cloud identity for fresh RGW
        credentials. Other cloud services remain available while you retry or
        ask an administrator to review the project&apos;s Object Storage role.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          href={objectStorageAuthRefreshHref(returnTo)}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Retry access
        </Link>
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          href="/"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to overview
        </Link>
      </div>
    </div>
  );
}
