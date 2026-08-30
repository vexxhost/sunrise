import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { ensureRequiredDataTableColumn } from "./data-table-columns";

interface Row {
  id: string;
  name: string;
  status: string;
}

describe("ensureRequiredDataTableColumn", () => {
  it("keeps an ID column visible", () => {
    const columns: ColumnDef<Row>[] = [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "id", header: "Port ID" },
    ];

    const result = ensureRequiredDataTableColumn(columns);

    expect(result[0].enableHiding).toBeUndefined();
    expect(result[1].enableHiding).toBe(false);
  });

  it("preserves an explicitly required column", () => {
    const columns: ColumnDef<Row>[] = [
      { accessorKey: "name", header: "Name", enableHiding: false },
      { accessorKey: "status", header: "Status" },
    ];

    const result = ensureRequiredDataTableColumn(columns);

    expect(result).toEqual(columns);
  });

  it("requires the first data column when no required column exists", () => {
    const columns: ColumnDef<Row>[] = [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "status", header: "Status" },
    ];

    const result = ensureRequiredDataTableColumn(columns);

    expect(result[0].enableHiding).toBe(false);
    expect(result[1].enableHiding).toBeUndefined();
    expect(columns[0].enableHiding).toBeUndefined();
  });
});
