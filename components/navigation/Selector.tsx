'use client';

import {
  NavigationMenuContent,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { useTransition } from "react";
import type { LucideIcon } from "lucide-react";

interface SelectorItem {
  id: string;
  [key: string]: any;
}

interface SelectorProps<T extends SelectorItem> {
  items: T[];
  selectedItem: T;
  icon: LucideIcon;
  displayKey: keyof T;
  onSelect: (itemId: string) => Promise<void>;
  listClassName?: string;
  triggerClassName?: string;
  buttonClassName?: string;
  iconOnly?: boolean;
}

export function Selector<T extends SelectorItem>({
  items,
  selectedItem,
  icon: Icon,
  displayKey,
  onSelect,
  listClassName = "min-w-[120px]",
  triggerClassName = "",
  buttonClassName = "",
  iconOnly = false,
}: SelectorProps<T>) {
  const [isPending, startTransition] = useTransition();
  const selectedLabel = selectedItem[displayKey] as string;

  const handleItemChange = (itemId: string) => {
    startTransition(async () => {
      await onSelect(itemId);
    });
  };

  return (
    <>
      <NavigationMenuTrigger
        className={`h-9 bg-muted/50 text-xs hover:bg-muted data-[state=open]:bg-muted ${
          iconOnly ? 'w-11 gap-0 px-2' : 'gap-2 px-3'
        } ${triggerClassName}`}
        disabled={isPending}
        aria-label={iconOnly ? selectedLabel : undefined}
        title={iconOnly ? selectedLabel : undefined}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {iconOnly ? null : (
          <span className={`min-w-0 truncate leading-none ${buttonClassName}`}>
            {selectedLabel}
          </span>
        )}
      </NavigationMenuTrigger>
      <NavigationMenuContent className="right-0 left-auto">
        <ul className={`p-1 ${listClassName}`}>
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleItemChange(item.id)}
                disabled={isPending}
                title={String(item[displayKey])}
                className={`w-full truncate rounded-md px-3 py-2 text-left text-xs transition-colors hover:bg-accent ${buttonClassName} ${
                  selectedItem.id === item.id ? 'bg-accent font-semibold' : ''
                } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {item[displayKey] as string}
              </button>
            </li>
          ))}
        </ul>
      </NavigationMenuContent>
    </>
  );
}
