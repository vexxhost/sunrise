"use client";

import { Table } from "@tanstack/react-table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "../ui/pagination";

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
function generatePaginationItems(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  const items: (number | 'ellipsis')[] = [];

  if (totalPages <= 7) {
    // Show all pages if total is 7 or less
    for (let i = 1; i <= totalPages; i++) {
      items.push(i);
    }
  } else {
    // Always show first page
    items.push(1);

    if (currentPage > 3) {
      items.push('ellipsis');
    }

    // Show pages around current page
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      items.push(i);
    }

    if (currentPage < totalPages - 2) {
      items.push('ellipsis');
    }

    // Always show last page
    items.push(totalPages);
  }

  return items;
}

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  return table.getRowModel().rows.length > 0 && (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => table.previousPage()}
            aria-disabled={!table.getCanPreviousPage()}
            className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : "cursor-pointer"}
          />
        </PaginationItem>

        {generatePaginationItems(
          table.getState().pagination.pageIndex + 1,
          table.getPageCount()
        ).map((item, index) => (
          <PaginationItem key={index}>
            {item === 'ellipsis' ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                onClick={() => table.setPageIndex(item - 1)}
                isActive={table.getState().pagination.pageIndex + 1 === item}
                className="cursor-pointer"
              >
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            onClick={() => table.nextPage()}
            aria-disabled={!table.getCanNextPage()}
            className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : "cursor-pointer"}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
