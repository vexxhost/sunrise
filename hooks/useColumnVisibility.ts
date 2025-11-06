import { ColumnDef } from '@tanstack/react-table';
import { useLocalStorage } from 'usehooks-ts';

/**
 * Hook to manage column visibility with localStorage persistence
 * Initializes visibility based on column meta.visible property
 */
export function useColumnVisibility<TData, TValue>(
  columns: ColumnDef<TData, TValue>[],
  resourceName?: string
) {
  const [columnVisibility, setColumnVisibility] = useLocalStorage<Record<string, boolean>>(
    `${resourceName}dataTableColumnVisibility`,
    () => {
      const visibility: Record<string, boolean> = {};

      columns.forEach((column) => {
        if ('accessorKey' in column && typeof column.accessorKey === 'string') {
          visibility[column.accessorKey] = column.meta?.visible ?? true;
        } else if (column.id) {
          visibility[column.id] = column.meta?.visible ?? true;
        }
      });

      return visibility;
    }
  );

  return {
    columnVisibility,
    setColumnVisibility,
  };
}
