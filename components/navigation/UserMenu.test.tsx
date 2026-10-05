import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: {
    user: {
      name: "operator@example.test",
      roles: [
        { id: "reader-id", name: "reader" },
        { id: "member-id", name: "member" },
      ],
    },
    project: { name: "demo-project1" },
    role: {
      name: "SunriseReadWrite",
      arn: "arn:aws:iam::RGW123:role/SunriseReadWrite",
      status: "active",
      message: "Object Storage access is active",
    },
    objectStorage: { backend: "s3" },
  },
}));

vi.mock("@/components/cloud/CloudContext", () => ({
  useCloudContext: () => mocks.context,
}));
vi.mock("@/components/ui/navigation-menu", () => ({
  NavigationMenuItem: ({ children, ...props }: ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  NavigationMenuTrigger: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  NavigationMenuContent: ({ children, ...props }: ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
}));

import { UserMenu } from "@/components/navigation/UserMenu";

describe("UserMenu", () => {
  it("separates OpenStack and RGW access context", () => {
    const html = renderToStaticMarkup(<UserMenu />);

    expect(html).toContain("operator@example.test");
    expect(html).toContain("demo-project1");
    expect(html).toContain("OpenStack access");
    expect(html).toContain("Project scoped");
    expect(html).toContain("2 effective roles");
    expect(html).toContain('title="member"');
    expect(html).toContain('title="reader"');
    expect(html).toContain("RGW IAM role");
    expect(html).toContain("SunriseReadWrite");
    expect(html).toContain('href="/identity"');
  });

  it("keeps a long effective-role list inside a bounded scroll area", () => {
    const originalRoles = mocks.context.user.roles;
    mocks.context.user.roles = Array.from({ length: 20 }, (_, index) => ({
      id: `role-${index + 1}-id`,
      name: `role-${index + 1}`,
    }));

    try {
      const html = renderToStaticMarkup(<UserMenu />);

      expect(html).toContain("20 effective roles");
      expect(html).toContain("max-h-28");
      expect(html).toContain("overflow-y-auto");
      expect(html).toContain('title="role-20"');
    } finally {
      mocks.context.user.roles = originalRoles;
    }
  });
});
