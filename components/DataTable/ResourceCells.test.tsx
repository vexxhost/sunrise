import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IDCell } from "./IDCell";
import { ResourceNameCell } from "./ResourceNameCell";

describe("resource table cells", () => {
  it("renders names as native links with their full text", () => {
    const href = "/kubernetes/clusters/example/overview";
    const html = renderToStaticMarkup(
      <ResourceNameCell href={href} value="Production cluster" />,
    );
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain('title="Production cluster"');
    expect(html).not.toContain("text-primary");
    expect(html).toContain("hover:underline");
  });

  it("gives a name that opens a dialog the same link styling without a fake URL", () => {
    const html = renderToStaticMarkup(
      <ResourceNameCell
        renderTrigger={(trigger) => trigger}
        value="ReadOnly"
      />,
    );
    expect(html).toContain('<button type="button"');
    expect(html).toContain("hover:underline");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).not.toContain("text-primary");
    expect(html).not.toContain("href=");
  });

  it("only links an ID when an explicit destination is present", () => {
    const value = "b93e8c2f-146d-4181-9977-57ea64d71b21";
    const href = `/compute/instances/${value}/overview`;
    expect(
      renderToStaticMarkup(<IDCell value={value} href={href} />),
    ).toContain(`href="${href}"`);
    const plain = renderToStaticMarkup(<IDCell value={value} />);
    expect(plain).not.toContain("href=");
    expect(plain).toContain(`title="${value}"`);
    expect(plain).toContain('aria-label="Copy ID"');
  });

  it("renders a truncated ARN trigger and a separate copy button", () => {
    const arn = "arn:aws:iam::123456789012:role/ReadOnly";
    const html = renderToStaticMarkup(
      <IDCell
        value={arn}
        copyLabel="Copy ARN"
        renderTrigger={(trigger) => trigger}
      />,
    );
    expect(html).toContain(`title="${arn}"`);
    expect(html).toContain(`<span class="block truncate">${arn}</span>`);
    expect(html).toMatch(/<\/button><button[^>]+aria-label="Copy ARN"/);
  });
});
