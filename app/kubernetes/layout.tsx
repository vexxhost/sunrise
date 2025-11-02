import { ServiceLayout } from "@/components/ServiceLayout";

const kubernetesSidebarSections = [
  {
    items: [
      { name: "Overview", href: "/kubernetes", icon: "Gauge" },
    ],
  },
  {
    title: "Clusters",
    items: [
      { name: "Clusters", href: "/kubernetes/clusters", icon: "Container" },
      { name: "Cluster Templates", href: "/kubernetes/templates", icon: "Settings" },
    ],
  },
  {
    title: "Network",
    items: [
      { name: "Load Balancers", href: "/kubernetes/load-balancers", icon: "Network" },
    ],
  },
];

export default function KubernetesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ServiceLayout sidebarSections={kubernetesSidebarSections}>
      {children}
    </ServiceLayout>
  );
}
