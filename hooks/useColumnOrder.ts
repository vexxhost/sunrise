import { ColumnDef } from '@tanstack/react-table';
import { useLocalStorage } from 'usehooks-ts';
import { type SetStateAction, useCallback, useEffect, useMemo } from 'react';

const LOCAL_STORAGE_OPTIONS = { initializeWithValue: false };
const PINNED_START_COLUMN_IDS = new Set(['select']);

function getColumnId<TData, TValue>(column: ColumnDef<TData, TValue>): string | undefined {
  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    return column.accessorKey;
  }

  return column.id;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function useColumnOrder<TData, TValue>(
  columns: ColumnDef<TData, TValue>[],
  resourceName?: string,
) {
  const defaultColumnOrder = useMemo(
    () => columns.map(getColumnId).filter((id): id is string => Boolean(id)),
    [columns],
  );
  const [storedColumnOrder, setColumnOrder] = useLocalStorage<string[]>(
    `${resourceName}dataTableColumnOrder`,
    () => defaultColumnOrder,
    LOCAL_STORAGE_OPTIONS,
  );

  const normalizeColumnOrder = useCallback((order: string[]) => {
    const availableIds = new Set(defaultColumnOrder);
    const pinnedStart = defaultColumnOrder.filter((id) => PINNED_START_COLUMN_IDS.has(id));
    const seen = new Set<string>(pinnedStart);
    const ordered = order.filter((id) => {
      if (!availableIds.has(id) || seen.has(id) || PINNED_START_COLUMN_IDS.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    });
    const missing = defaultColumnOrder.filter((id) => !seen.has(id));

    return [...pinnedStart, ...ordered, ...missing];
  }, [defaultColumnOrder]);

  const columnOrder = useMemo(
    () => normalizeColumnOrder(storedColumnOrder),
    [normalizeColumnOrder, storedColumnOrder],
  );

  const setNormalizedColumnOrder = useCallback((value: SetStateAction<string[]>) => {
    setColumnOrder((currentColumnOrder) => {
      const normalizedCurrentColumnOrder = normalizeColumnOrder(currentColumnOrder);
      const nextColumnOrder = typeof value === 'function'
        ? value(normalizedCurrentColumnOrder)
        : value;

      return normalizeColumnOrder(nextColumnOrder);
    });
  }, [normalizeColumnOrder, setColumnOrder]);

  useEffect(() => {
    if (!arraysEqual(columnOrder, storedColumnOrder)) {
      setNormalizedColumnOrder(columnOrder);
    }
  }, [columnOrder, setNormalizedColumnOrder, storedColumnOrder]);

  return {
    columnOrder,
    setColumnOrder: setNormalizedColumnOrder,
  };
}
