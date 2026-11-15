import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function PortsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="network">{children}</ConfiguredService>;
}
