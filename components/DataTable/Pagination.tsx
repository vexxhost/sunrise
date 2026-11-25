"use client";

import { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";

/**
 * Helper function to generate page numbers with ellipsis for pagination UI
 *
 * @param currentPage - Current page number (1-indexed)
 * @param totalPages - Total number of pages
 * @returns Array of page numbers and 'ellipsis' markers
 *
 * @example
 * generatePaginationItems(5, 10)
 * // Returns: [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]
 */
function generatePaginationItems(
  currentPage: number,
  totalPages: number,
): (number | "ellipsis")[] {
  const items: (number | "ellipsis")[] = [];

  if (totalPages <= 7) {
    // Show all pages if total is 7 or less
    for (let i = 1; i <= totalPages; i++) {
      items.push(i);
    }
  } else {
    // Always show first page
    items.push(1);

    if (currentPage > 3) {
      items.push("ellipsis");
    }

    // Show pages around current page
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      items.push(i);
    }

    if (currentPage < totalPages - 2) {
      items.push("ellipsis");
    }

    // Always show last page
    items.push(totalPages);
  }

  return items;
}

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  if (!table.getRowModel().rows.length) return null;
  const currentPage = table.getState().pagination.pageIndex + 1;

  return (
    <Pagination aria-label="Table pages" className="mx-0 w-auto max-w-full">
      <PaginationContent className="flex-wrap">
        <PaginationItem>
          <Button
            type="button"
            variant="ghost"
            aria-label="Go to previous page"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft />
            <span className="hidden sm:inline">Previous</span>
          </Button>
        </PaginationItem>

        {generatePaginationItems(currentPage, table.getPageCount()).map(
          (item, index) => (
            <PaginationItem
              key={index}
              className={
                item === currentPage ? undefined : "hidden sm:list-item"
              }
            >
              {item === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <Button
                  type="button"
                  size="icon"
                  variant={item === currentPage ? "outline" : "ghost"}
                  onClick={() => table.setPageIndex(item - 1)}
                  aria-current={item === currentPage ? "page" : undefined}
                  aria-label={`Page ${item}`}
                >
                  {item}
                </Button>
              )}
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <Button
            type="button"
            variant="ghost"
            aria-label="Go to next page"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
