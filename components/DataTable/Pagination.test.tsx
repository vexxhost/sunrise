import type { Table } from "@tanstack/react-table";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DataTablePagination } from "./Pagination";

function table(pageIndex: number, pageCount: number): Table<object> {
  return {
    getRowModel: () => ({ rows: pageCount ? [{}] : [] }),
    getState: () => ({ pagination: { pageIndex } }),
    getPageCount: () => pageCount,
    getCanPreviousPage: () => pageIndex > 0,
    getCanNextPage: () => pageIndex < pageCount - 1,
    previousPage: vi.fn(),
    nextPage: vi.fn(),
    setPageIndex: vi.fn(),
  } as unknown as Table<object>;
}

describe("table pagination", () => {
  it("uses buttons for local page changes and marks the current page", () => {
    const html = renderToStaticMarkup(
      <DataTablePagination table={table(1, 4)} />,
    );
    expect(html).not.toContain("<a ");
    expect(html).toMatch(/<button[^>]+aria-label="Go to next page"/);
    expect(html).toMatch(
      /<button[^>]+aria-current="page"[^>]+aria-label="Page 2"/,
    );
  });

  it("disables pagination at a boundary and hides it for an empty table", () => {
    const html = renderToStaticMarkup(
      <DataTablePagination table={table(0, 1)} />,
    );
    expect(html).toMatch(
      /<button(?=[^>]+disabled)(?=[^>]+aria-label="Go to previous page")[^>]*>/,
    );
    expect(html).toMatch(
      /<button(?=[^>]+disabled)(?=[^>]+aria-label="Go to next page")[^>]*>/,
    );
    expect(
      renderToStaticMarkup(<DataTablePagination table={table(0, 0)} />),
    ).toBe("");
  });
});
