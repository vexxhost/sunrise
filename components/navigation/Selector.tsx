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
}: SelectorProps<T>) {
  const [isPending, startTransition] = useTransition();

  const handleItemChange = (itemId: string) => {
    startTransition(async () => {
      await onSelect(itemId);
    });
  };

  return (
    <>
      <NavigationMenuTrigger
        className={`gap-2 text-xs h-9 px-3 bg-muted/50 hover:bg-muted data-[state=open]:bg-muted ${triggerClassName}`}
        disabled={isPending}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className={`leading-none ${buttonClassName}`}>
          {selectedItem[displayKey] as string}
        </span>
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className={`p-1 ${listClassName}`}>
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleItemChange(item.id)}
                disabled={isPending}
                className={`w-full text-left px-3 py-2 text-xs rounded-md hover:bg-accent transition-colors whitespace-nowrap ${buttonClassName} ${
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
