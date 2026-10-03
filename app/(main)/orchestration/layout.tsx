import { ServiceLayout } from "@/components/ServiceLayout";
import { ConfiguredService } from "@/components/services/ServiceGuards";

const orchestrationSidebarSections = [
  {
    items: [{ name: "Overview", href: "/orchestration", icon: "Gauge" }],
  },
  {
    title: "Stacks",
    items: [
      { name: "Stacks", href: "/orchestration/stacks", icon: "Layers" },
      { name: "Templates", href: "/orchestration/templates", icon: "FileText" },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        name: "Resource Types",
        href: "/orchestration/resource-types",
        icon: "Settings",
      },
    ],
  },
];

export default function OrchestrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfiguredService id="orchestration">
      <ServiceLayout sidebarSections={orchestrationSidebarSections}>
        {children}
      </ServiceLayout>
    </ConfiguredService>
  );
}
