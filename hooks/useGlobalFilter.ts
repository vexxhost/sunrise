import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Filter } from '@/components/FilterBuilder';

/**
 * Custom filter function for TanStack Table that handles multiple filter types
 * Supports string, number, boolean, and date filtering with various operators
 */
export function createGlobalFilterFn<TData, TValue>(columns: ColumnDef<TData, TValue>[]) {
  return (row: any, _columnId: string, filterValue: any) => {
    const filters = filterValue as Filter[];
    if (!filters || filters.length === 0) return true;

    return filters.every((filter) => {
      const rawValue = row.original[filter.columnId];

      // Get the column to check its field type
      const column = columns.find((col) => {
        if ('accessorKey' in col) {
          return col.accessorKey === filter.columnId;
        }
        return col.id === filter.columnId;
      });
      const fieldType = column?.meta?.fieldType;

      // Handle different field types
      if (fieldType === 'number') {
        const cellValue = Number(rawValue);
        const filterValue = Number(filter.value);

        if (isNaN(cellValue) || isNaN(filterValue)) return false;

        switch (filter.operator) {
          case 'equals':
            return cellValue === filterValue;
          case 'notEquals':
            return cellValue !== filterValue;
          case 'greaterThan':
            return cellValue > filterValue;
          case 'lessThan':
            return cellValue < filterValue;
          case 'greaterThanOrEqual':
            return cellValue >= filterValue;
          case 'lessThanOrEqual':
            return cellValue <= filterValue;
          default:
            return true;
        }
      } else if (fieldType === 'boolean') {
        const cellValue = Boolean(rawValue);
        // Map "Yes"/"No" to boolean
        const filterValue = filter.value.toLowerCase() === 'yes';

        return filter.operator === 'equals' ? cellValue === filterValue : cellValue !== filterValue;
      } else if (fieldType === 'date') {
        const cellDate = new Date(rawValue);
        const filterDate = new Date(filter.value);

        if (isNaN(cellDate.getTime()) || isNaN(filterDate.getTime())) return false;

        switch (filter.operator) {
          case 'equals':
            return cellDate.toDateString() === filterDate.toDateString();
          case 'before':
            return cellDate < filterDate;
          case 'after':
            return cellDate > filterDate;
          default:
            return true;
        }
      } else {
        // String type (default)
        const cellValue = String(rawValue || '').toLowerCase();
        const filterValue = filter.value.toLowerCase();

        switch (filter.operator) {
          case 'equals':
            return cellValue === filterValue;
          case 'notEquals':
            return cellValue !== filterValue;
          case 'contains':
            return cellValue.includes(filterValue);
          case 'notContains':
            return !cellValue.includes(filterValue);
          default:
            return true;
        }
      }
    });
  };
}

/**
 * Hook to manage global filter state for DataTable
 */
export function useGlobalFilter() {
  const [globalFilter, setGlobalFilter] = useState<Filter[]>([]);

  return {
    globalFilter,
    setGlobalFilter,
  };
}
