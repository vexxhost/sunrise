'use client';

import { MapPin } from "lucide-react";
import { setRegionAction } from "@/lib/keystone/actions";
import { useRouter } from "next/navigation";
import type { Region } from "@/types/openstack";
import { Selector } from "./Selector";

interface RegionSelectorProps {
  regions: Region[];
  selectedRegion: Region;
}

export function RegionSelector({ regions, selectedRegion }: RegionSelectorProps) {
  const router = useRouter();

  const handleSelect = async (regionId: string) => {
    await setRegionAction(regionId);
    router.refresh();
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
