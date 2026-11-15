import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function NetworksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="network">{children}</ConfiguredService>;
}
