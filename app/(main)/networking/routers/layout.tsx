import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function RoutersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="network">{children}</ConfiguredService>;
}
