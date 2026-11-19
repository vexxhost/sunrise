export const NEUTRON_PORT_VNIC_TYPES = [
  "normal",
  "direct",
  "direct-physical",
  "macvtap",
  "baremetal",
  "virtio-forwarder",
  "smart-nic",
  "vdpa",
  "accelerator-direct",
  "accelerator-direct-physical",
  "remote-managed",
] as const;

export type NeutronPortVnicType = (typeof NEUTRON_PORT_VNIC_TYPES)[number];

export function isNeutronPortVnicType(
  value: string,
): value is NeutronPortVnicType {
  return NEUTRON_PORT_VNIC_TYPES.some((candidate) => candidate === value);
}

export const NEUTRON_PORT_VNIC_TYPE_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: NeutronPortVnicType;
}> = [
  {
    value: "normal",
    label: "Normal",
    description: "Standard virtual network interface",
  },
  {
    value: "direct",
    label: "Direct",
    description: "SR-IOV virtual function passthrough",
  },
  {
    value: "direct-physical",
    label: "Direct physical",
    description: "Physical function passthrough",
  },
  {
    value: "macvtap",
    label: "Macvtap",
    description: "Macvtap-backed virtual interface",
  },
  {
    value: "baremetal",
    label: "Bare metal",
    description: "Interface managed for a bare-metal node",
  },
  {
    value: "virtio-forwarder",
    label: "Virtio forwarder",
    description: "Virtio forwarder accelerated interface",
  },
  {
    value: "smart-nic",
    label: "Smart NIC",
    description: "SmartNIC-offloaded interface",
  },
  {
    value: "vdpa",
    label: "vDPA",
    description: "vDPA accelerated virtio interface",
  },
  {
    value: "accelerator-direct",
    label: "Accelerator direct",
    description: "Cyborg-managed virtual accelerator",
  },
  {
    value: "accelerator-direct-physical",
    label: "Accelerator direct physical",
    description: "Cyborg-managed physical accelerator",
  },
  {
    value: "remote-managed",
    label: "Remote managed",
    description: "Remotely managed SmartNIC interface",
  },
];

export function neutronPortVnicTypeLabel(value: string | undefined) {
  return (
    NEUTRON_PORT_VNIC_TYPE_OPTIONS.find((option) => option.value === value)
      ?.label ??
    value ??
    "Normal"
  );
}
