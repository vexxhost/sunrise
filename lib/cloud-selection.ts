export function selectActiveCloudItem<T extends { id: string }>(
  items: T[],
  activeId: string | null,
): T | undefined {
  return items.find((item) => item.id === activeId) ?? items[0];
}
