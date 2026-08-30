import { ColumnDef } from '@tanstack/react-table';
import { useLocalStorage } from 'usehooks-ts';
import { useEffect, useMemo } from 'react';
import {
  getDataTableColumnId,
  isRequiredDataTableColumn,
} from '@/lib/data-table-columns';

const LOCAL_STORAGE_OPTIONS = { initializeWithValue: false };

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
      const id = getDataTableColumnId(column);
      if (id) {
        visibility[id] = isRequiredDataTableColumn(column)
          ? true
          : column.meta?.visible ?? true;
      }
    });

    return visibility;
  }, [columns]);
  const requiredVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};

    columns.forEach((column) => {
      const id = getDataTableColumnId(column);
      if (id && isRequiredDataTableColumn(column)) {
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
