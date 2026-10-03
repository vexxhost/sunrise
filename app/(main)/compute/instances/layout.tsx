import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function InstancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="compute">{children}</ConfiguredService>;
}
