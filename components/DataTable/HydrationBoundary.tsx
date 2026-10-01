import { makeQueryClient } from "@/lib/query-client";
import { ReactNode, Suspense } from "react";
import { dehydrateQueryClient, hydrateQueries } from "@/lib/query-hydration";
import { QueryHydrationBoundary } from "@/components/QueryHydrationBoundary";
import { DataTableHeader } from "./Header";
import { DataTableToolbar } from "./Toolbar";
import { DataTableRowAction } from "../DataTable";

interface DataTableHydrationBoundaryProps {
  resourceName: string;
  actions?: ReactNode;
  queries: Array<any>;
  children: ReactNode;
  rowActions?: DataTableRowAction<any>[];
}

export async function DataTableHydrationBoundary({
  resourceName,
  actions,
  queries,
  children,
  rowActions = [],
}: DataTableHydrationBoundaryProps) {
  const queryClient = makeQueryClient();
  await hydrateQueries(queryClient, queries);
  const { cacheIdentity, state } = dehydrateQueryClient(queryClient);

  return (
    <QueryHydrationBoundary key={cacheIdentity} state={state}>
      <DataTableHeader resourceName={resourceName} actions={actions} />
      <Suspense
        fallback={
          <>
            <DataTableToolbar
              resourceName={resourceName}
              rowActions={rowActions}
            />
            <div className="rounded-md border flex items-center justify-center h-64">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          </>
        }
      >
        {children}
      </Suspense>
    </QueryHydrationBoundary>
  );
}
