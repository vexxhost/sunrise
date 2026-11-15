import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function FloatingIpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="network">{children}</ConfiguredService>;
}
