"use client"

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, type Column } from "@tanstack/react-table"
import pluralize from "pluralize"
import { useState } from "react"
import { titleCase } from "title-case"
import { DataTableDialogButton } from "./DataTable/Dialog"
import { cn } from "@/lib/utils"

// Helper function to extract label from column definition
function getColumnLabel<TData, TValue>(column: any): string {
  // First check if meta.label exists
  if (column.columnDef.meta?.label) {
    return column.columnDef.meta.label;
  }

  // If header is a string, use that
  if (typeof column.columnDef.header === 'string') {
    return column.columnDef.header;
  }

  // Try to extract text from header function by rendering it
  // This works for simple button headers with text content
  if (typeof column.columnDef.header === 'function') {
    try {
      // Try to render the header and extract text
      const headerElement = column.columnDef.header({ column: column });
      if (headerElement?.props?.children) {
        // Extract text from children (handles Button components with text)
        const children = headerElement.props.children;
        if (Array.isArray(children)) {
          const textChild = children.find((child: any) => typeof child === 'string');
          if (textChild) return textChild;
        } else if (typeof children === 'string') {
          return children;
        }
      }
    } catch (e) {
      // If extraction fails, fall through to column id
    }
  }

  // Otherwise fall back to column id (formatted)
  return titleCase(column.id.replace(/[_-]/g, ' '));
}

interface DataTableDialogProps<TData> {
  table: Table<TData>
  resourceName?: string
}

interface SortableColumnItemProps<TData> {
  column: Column<TData, unknown>
  label: string
  isRequired: boolean
  isFirst: boolean
  isLast: boolean
  moveColumn: (columnId: string, direction: -1 | 1) => void
}

function SortableColumnItem<TData>({
  column,
  label,
  isRequired,
  isFirst,
  isLast,
  moveColumn,
}: SortableColumnItemProps<TData>) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "relative flex items-center gap-2 rounded-md px-1 py-1 transition-colors",
        isDragging && "z-10 bg-accent opacity-80 shadow-sm",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="inline-flex h-8 w-6 cursor-grab items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        aria-label={`Drag ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        id={`dialog-${column.id}`}
        checked={column.getIsVisible()}
        disabled={isRequired}
        onCheckedChange={(checked) => column.toggleVisibility(!!checked)}
      />
      <label
        htmlFor={`dialog-${column.id}`}
        className="min-w-0 flex-1 text-sm font-normal cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {isRequired && (
          <span className="ml-2 text-xs text-muted-foreground">
            Required
          </span>
        )}
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => moveColumn(column.id, -1)}
        disabled={isFirst}
        title={`Move ${label} up`}
      >
        <ArrowUp className="h-4 w-4" />
        <span className="sr-only">Move {label} up</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => moveColumn(column.id, 1)}
        disabled={isLast}
        title={`Move ${label} down`}
      >
        <ArrowDown className="h-4 w-4" />
        <span className="sr-only">Move {label} down</span>
      </Button>
    </div>
  );
}

export function DataTableDialog<TData>({
  table,
  resourceName,
}: DataTableDialogProps<TData>) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState("")
  const columns = table.getAllLeafColumns().filter((column) => column.id !== "select")
  const allColumnIds = columns.map((column) => column.id)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const getCurrentColumnOrder = () => {
    const order = table.getState().columnOrder;
    const seen = new Set<string>();
    const ordered = order.filter((id) => {
      if (!allColumnIds.includes(id) || seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    });
    const missing = allColumnIds.filter((id) => !seen.has(id));

    return [...ordered, ...missing];
  }

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    const order = getCurrentColumnOrder();
    const currentIndex = order.indexOf(columnId);
    const nextIndex = currentIndex + direction;

    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= order.length) {
      return;
    }

    const nextOrder = [...order];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [
      nextOrder[nextIndex],
      nextOrder[currentIndex],
    ];
    table.setColumnOrder(nextOrder);
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const order = getCurrentColumnOrder();
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));

    if (oldIndex === -1 || newIndex === -1) return;

    table.setColumnOrder(arrayMove(order, oldIndex, newIndex));
  }

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open)

    if (!open) {
      setColumnSearch("")
    }
  }

  const columnsById = new Map(columns.map((column) => [column.id, column]));
  const orderedColumns = getCurrentColumnOrder()
    .map((id) => columnsById.get(id))
    .filter((column): column is (typeof columns)[number] => Boolean(column));
  const filteredColumns = orderedColumns.filter((column) => {
    const label = getColumnLabel(column);
    return columnSearch === "" ||
      label.toLowerCase().includes(columnSearch.toLowerCase()) ||
      column.id.toLowerCase().includes(columnSearch.toLowerCase())
  });

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <DataTableDialogButton />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Table Settings</DialogTitle>
          <DialogDescription>
            Customize the table page size, column order, and visible columns.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-8 py-6">
          <div className="flex-shrink-0 w-48">
            <Label className="text-base font-semibold block mb-4">Page size</Label>
            <RadioGroup
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => table.setPageSize(Number(value))}
              className="gap-3"
            >
              {[10, 25, 50].map((size) => (
                <div key={size} className="flex items-center space-x-2">
                  <RadioGroupItem value={String(size)} id={`r${size}`} />
                  <Label htmlFor={`r${size}`} className="font-normal cursor-pointer">
                    {resourceName ? `${size} ${pluralize(resourceName)}` : String(size)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="flex-1 min-w-0">
            <Label className="text-base font-semibold block mb-4">Columns</Label>
            <Input
              placeholder="Search columns..."
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
              className="mb-3 h-8 text-sm"
            />
            <div className="flex flex-col gap-y-3 max-h-[300px] overflow-y-auto pr-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredColumns.map((column) => column.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredColumns
                    .map((column) => {
                      const label = getColumnLabel(column);
                      const currentOrder = getCurrentColumnOrder();
                      const orderIndex = currentOrder.indexOf(column.id);
                      const isRequired = !column.getCanHide();
                      return (
                        <SortableColumnItem
                          key={column.id}
                          column={column}
                          label={label}
                          isRequired={isRequired}
                          isFirst={orderIndex <= 0}
                          isLast={orderIndex === -1 || orderIndex >= currentOrder.length - 1}
                          moveColumn={moveColumn}
                        />
                      );
                    })
                  }
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
