import { ColumnDef } from '@tanstack/react-table';
import { useLocalStorage } from 'usehooks-ts';
import { useEffect, useMemo } from 'react';

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
  );

  const columnOrder = useMemo(() => {
    const availableIds = new Set(defaultColumnOrder);
    const seen = new Set<string>();
    const ordered = storedColumnOrder.filter((id) => {
      if (!availableIds.has(id) || seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    });
    const missing = defaultColumnOrder.filter((id) => !seen.has(id));

    return [...ordered, ...missing];
  }, [defaultColumnOrder, storedColumnOrder]);

  useEffect(() => {
    if (!arraysEqual(columnOrder, storedColumnOrder)) {
      setColumnOrder(columnOrder);
    }
  }, [columnOrder, setColumnOrder, storedColumnOrder]);

  return {
    columnOrder,
    setColumnOrder,
  };
}
