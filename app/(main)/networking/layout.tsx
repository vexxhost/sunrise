import { ServiceLayout } from "@/components/ServiceLayout";
import { ConfiguredService } from "@/components/services/ServiceGuards";

const networkingSidebarSections = [
  {
    items: [{ name: "Overview", href: "/networking", icon: "Gauge" }],
  },
  {
    title: "Network",
    items: [
      { name: "Topology", href: "/networking/topology", icon: "Workflow" },
      { name: "Networks", href: "/networking/networks", icon: "Network" },
      { name: "Routers", href: "/networking/routers", icon: "Router" },
      { name: "Ports", href: "/networking/ports", icon: "Cable" },
      {
        name: "Floating IPs",
        href: "/networking/floating-ips",
        icon: "Globe2",
      },
    ],
  },
  {
    title: "Security",
    items: [
      {
        name: "Security Groups",
        href: "/networking/security-groups",
        icon: "Shield",
      },
    ],
  },
];

export default function NetworkingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfiguredService id="network">
      <ServiceLayout sidebarSections={networkingSidebarSections}>
        {children}
      </ServiceLayout>
    </ConfiguredService>
  );
}
