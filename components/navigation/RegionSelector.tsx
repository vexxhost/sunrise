'use client';

import { MapPin } from "lucide-react";
import { setRegionAction } from "@/lib/keystone/actions";
import { useKeystoneStore } from "@/stores/useKeystoneStore";
import type { Region } from "@/types/openstack";
import { Selector } from "./Selector";

interface RegionSelectorProps {
  regions: Region[];
  selectedRegion: Region;
}

export function RegionSelector({ regions, selectedRegion }: RegionSelectorProps) {
  const setRegion = useKeystoneStore(state => state.setRegion);

  const handleSelect = async (regionId: string) => {
    const region = regions.find(r => r.id === regionId);
    if (region) {
      setRegion(region);
    }
    await setRegionAction(regionId);
  };

  return (
    <Selector
      items={regions}
      selectedItem={selectedRegion}
      icon={MapPin}
      displayKey="id"
      onSelect={handleSelect}
      listClassName="min-w-[120px]"
      buttonClassName="font-mono"
    />
  );
}
