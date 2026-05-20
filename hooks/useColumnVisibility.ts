import { ColumnDef } from '@tanstack/react-table';
import { useLocalStorage } from 'usehooks-ts';
import { useEffect, useMemo } from 'react';

const LOCAL_STORAGE_OPTIONS = { initializeWithValue: false };

function getColumnId<TData, TValue>(column: ColumnDef<TData, TValue>): string | undefined {
  if ('accessorKey' in column && typeof column.accessorKey === 'string') {
    return column.accessorKey;
  }

  return column.id;
}

function isRequiredColumn<TData, TValue>(column: ColumnDef<TData, TValue>) {
  return (
    column.enableHiding === false ||
    getColumnId(column) === 'id' ||
    column.header === 'ID'
  );
}

function recordsEqual(left: Record<string, boolean>, right: Record<string, boolean>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

/**
 * Hook to manage column visibility with localStorage persistence
 * Initializes visibility based on column meta.visible property
 */
export function useColumnVisibility<TData, TValue>(
  columns: ColumnDef<TData, TValue>[],
  resourceName?: string
) {
  const defaultVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};

    columns.forEach((column) => {
      const id = getColumnId(column);
      if (id) {
        visibility[id] = isRequiredColumn(column) ? true : column.meta?.visible ?? true;
      }
    });

    return visibility;
  }, [columns]);
  const requiredVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};

    columns.forEach((column) => {
      const id = getColumnId(column);
      if (id && isRequiredColumn(column)) {
        visibility[id] = true;
      }
    });

    return visibility;
  }, [columns]);

  const [columnVisibility, setColumnVisibility] = useLocalStorage<Record<string, boolean>>(
    `${resourceName}dataTableColumnVisibility`,
    () => defaultVisibility,
    LOCAL_STORAGE_OPTIONS,
  );

  const effectiveColumnVisibility = useMemo(
    () => ({ ...defaultVisibility, ...columnVisibility, ...requiredVisibility }),
    [columnVisibility, defaultVisibility, requiredVisibility],
  );

  useEffect(() => {
    if (!recordsEqual(effectiveColumnVisibility, columnVisibility)) {
      setColumnVisibility(effectiveColumnVisibility);
    }
  }, [columnVisibility, effectiveColumnVisibility, setColumnVisibility]);

  return {
    columnVisibility: effectiveColumnVisibility,
    setColumnVisibility,
  };
}
