"use client";

import { MapPin } from "lucide-react";
import { useCloudContext } from "@/components/cloud/CloudContext";
import { setRegion } from "@/lib/keystone/actions";
import { useRouter } from "next/navigation";
import { Selector } from "./Selector";

export function RegionSelector() {
  const { regions, region: activeRegion } = useCloudContext();
  const router = useRouter();
  const selectedRegion = regions.find((region) => region.id === activeRegion.id);

  if (!selectedRegion) return null;

  const handleSelect = async (regionId: string) => {
    const region = regions.find((item) => item.id === regionId);
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
      collapseLabelOnMobile
    />
  );
}
