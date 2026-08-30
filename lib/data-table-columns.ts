import type { ColumnDef } from "@tanstack/react-table";

export function getDataTableColumnId<TData, TValue>(
  column: ColumnDef<TData, TValue>,
): string | undefined {
  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey;
  }

  return column.id;
}

export function isRequiredDataTableColumn<TData, TValue>(
  column: ColumnDef<TData, TValue>,
) {
  return (
    column.enableHiding === false ||
    getDataTableColumnId(column) === "id" ||
    column.header === "ID"
  );
}

/**
 * Keep table settings usable by ensuring at least one data column stays visible.
 */
export function ensureRequiredDataTableColumn<TData, TValue>(
  columns: ColumnDef<TData, TValue>[],
): ColumnDef<TData, TValue>[] {
  const requiredColumnIndex = columns.findIndex(isRequiredDataTableColumn);
  const fallbackColumnIndex = columns.findIndex((column) =>
    Boolean(getDataTableColumnId(column)),
  );
  const indexToRequire =
    requiredColumnIndex === -1 ? fallbackColumnIndex : requiredColumnIndex;

  if (indexToRequire === -1) {
    return columns;
  }

  return columns.map((column, index) =>
    index === indexToRequire && column.enableHiding !== false
      ? { ...column, enableHiding: false }
      : column,
  );
}
