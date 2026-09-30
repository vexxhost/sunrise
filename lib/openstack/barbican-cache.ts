import type { BarbicanPage } from "@/types/openstack";

export function removeBarbicanPageItem<T extends { id: string }>(
  page: BarbicanPage<T> | undefined,
  id: string,
) {
  if (!page) return page;
  const items = page.items.filter((item) => item.id !== id);
  if (items.length === page.items.length) return page;
  return { items, total: Math.max(0, page.total - 1) };
}
