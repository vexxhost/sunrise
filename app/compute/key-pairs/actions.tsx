"use client";

import { ActionButton } from "@/components/DataTable/ActionButton";
import { ButtonGroup } from "@/components/ui/button-group";
import { Plus, Upload } from "lucide-react";

export function Actions() {
  return <ButtonGroup>
    <ActionButton
      label="Import"
      variant="outline"
      icon={Upload}
      onClick={() => {
        console.log("Import key pair");
      }}
    />
    <ActionButton
      label="Create"
      variant="default"
      icon={Plus}
      onClick={() => {
        console.log("Create key pair");
      }}
    />
  </ButtonGroup>
}
