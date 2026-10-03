import { S3BackendOnly } from "@/components/services/ServiceGuards";

export default function RolesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <S3BackendOnly>{children}</S3BackendOnly>;
}
