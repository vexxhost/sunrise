import { ServiceLayout } from "@/components/ServiceLayout";
import { ConfiguredService } from "@/components/services/ServiceGuards";

const kubernetesSidebarSections = [
  {
    items: [{ name: "Overview", href: "/kubernetes", icon: "Gauge" }],
  },
  {
    title: "Clusters",
    items: [
      { name: "Clusters", href: "/kubernetes/clusters", icon: "Container" },
      {
        name: "Cluster Templates",
        href: "/kubernetes/templates",
        icon: "Settings",
      },
    ],
  },
];

export default function KubernetesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfiguredService id="container-infra">
      <ServiceLayout sidebarSections={kubernetesSidebarSections}>
        {children}
      </ServiceLayout>
    </ConfiguredService>
  );
}
