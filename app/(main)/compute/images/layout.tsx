import { ConfiguredService } from "@/components/services/ServiceGuards";

export default function ImagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConfiguredService id="image">{children}</ConfiguredService>;
}
