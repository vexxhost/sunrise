import { ServiceLayout } from "@/components/ServiceLayout";

const computeSidebarSections = [
  {
    items: [
      { name: "Overview", href: "/compute", icon: "Gauge" },
    ],
  },
  {
    title: "Instances",
    items: [
      { name: "Instances", href: "/compute/instances", icon: "Server" },
      { name: "Instance Types", href: "/compute/instance-types", icon: "Cpu" },
      { name: "Images", href: "/compute/images", icon: "Image" },
      { name: "Key Pairs", href: "/compute/key-pairs", icon: "Key" },
    ],
  },
  {
    title: "Network",
    items: [
      { name: "Networks", href: "/compute/networks", icon: "Network" },
      { name: "Security Groups", href: "/compute/security-groups", icon: "Shield" },
    ],
  },
  {
    title: "Block Storage",
    items: [
      { name: "Volumes", href: "/compute/volumes", icon: "HardDrive" },
      { name: "Snapshots", href: "/compute/snapshots", icon: "Camera" },
    ],
  },
];

export default function ComputeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServiceLayout sidebarSections={computeSidebarSections}>
      {children}
    </ServiceLayout>
  );
}
