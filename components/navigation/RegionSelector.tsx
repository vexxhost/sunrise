'use client';

import { MapPin } from "lucide-react";
import { useKeystoneStore } from "@/stores/useKeystoneStore";
import { useRegions } from "@/hooks/queries/useRegions";
import { useEffect } from "react";
import {
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

export function RegionSelector() {
  const { region, setRegion } = useKeystoneStore();
  const { data: regions = [] } = useRegions();

  useEffect(() => {
    if (!region && regions.length > 0) {
      setRegion(regions[0]);
    }
  }, [region, regions, setRegion]);

  if (!region || regions.length === 0) {
    return null;
  }

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="gap-2 text-xs h-9 px-3 bg-muted/50 hover:bg-muted data-[state=open]:bg-muted">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono leading-none">{region.id}</span>
      </NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="p-1 min-w-[120px]">
          {regions.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setRegion(r)}
                className={`w-full text-left px-3 py-2 text-xs font-mono rounded-md hover:bg-accent transition-colors whitespace-nowrap ${
                  region.id === r.id ? 'bg-accent font-semibold' : ''
                }`}
              >
                {r.id}
              </button>
            </li>
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}
