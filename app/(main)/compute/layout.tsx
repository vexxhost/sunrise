import { ServiceLayout, type SidebarItem } from "@/components/ServiceLayout";
import { ConfiguredServiceGroup } from "@/components/services/ServiceGuards";
import { getServicePolicy } from "@/lib/deployment-config";
import {
  isServiceEnabled,
  type OpenStackServiceId,
} from "@/lib/service-policy";
import { getSession } from "@/lib/session";

type PolicySidebarItem = SidebarItem & {
  policyService?: OpenStackServiceId;
};

const computeSidebarSections: Array<{
  title?: string;
  items: PolicySidebarItem[];
}> = [
  {
    items: [{ name: "Overview", href: "/compute", icon: "Gauge" }],
  },
  {
    title: "Instances",
    items: [
      {
        name: "Instances",
        href: "/compute/instances",
        icon: "Server",
        policyService: "compute",
      },
      {
        name: "Instance Flavors",
        href: "/compute/instance-flavors",
        icon: "Cpu",
        policyService: "compute",
      },
      {
        name: "Images",
        href: "/compute/images",
        icon: "Image",
        policyService: "image",
      },
    ],
  },
  {
    title: "Block Storage",
    items: [
      {
        name: "Volumes",
        href: "/compute/volumes",
        icon: "HardDrive",
        policyService: "volume",
      },
      {
        name: "Snapshots",
        href: "/compute/snapshots",
        icon: "Camera",
        policyService: "volume",
      },
    ],
  },
  {
    title: "Access",
    items: [
      {
        name: "Key Pairs",
        href: "/compute/key-pairs",
        icon: "Key",
        policyService: "compute",
      },
    ],
  },
];

export default async function ComputeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const policy = getServicePolicy();
  const sidebarSections = computeSidebarSections
    .map((section) => ({
      title: section.title,
      items: section.items
        .filter(
          ({ policyService }) =>
            !policyService ||
            isServiceEnabled(policy, policyService, session.regionId),
        )
        .map(({ policyService: _, ...item }) => item),
    }))
    .filter(({ items }) => items.length > 0);

  return (
    <ConfiguredServiceGroup id="compute">
      <ServiceLayout sidebarSections={sidebarSections}>
        {children}
      </ServiceLayout>
    </ConfiguredServiceGroup>
  );
}
