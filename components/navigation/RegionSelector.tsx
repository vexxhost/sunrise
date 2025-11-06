'use client';

import { MapPin } from "lucide-react";
import { setRegion } from "@/lib/keystone/actions";
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
    const region = regions.find(r => r.id === regionId);
    if (region) {
      await setRegion(region);
      router.refresh();
    }
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
