import { isCreateActionRequested } from "@/lib/create-actions";
import { listOrders } from "@/lib/openstack/barbican-server";
import { getSession } from "@/lib/session";
import { OrdersClient } from "./OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const [session, initialData] = await Promise.all([
    getSession(),
    listOrders(),
  ]);
  return (
    <OrdersClient
      projectId={session.projectId ?? ""}
      regionId={session.regionId ?? ""}
      initialData={initialData}
      initiallyCreateOpen={isCreateActionRequested(
        (await searchParams).create,
        "secret-order",
      )}
    />
  );
}
