import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  formatImageSelectionSize,
  ImageSelectOption,
} from "@/components/Image/ImageSelectOption";
import type { Image } from "@/types/openstack";

function image(size: number | null) {
  return {
    id: "69aab43e-dbfc-44d9-b6c5-f64b8d07bb82",
    name: "ubuntu-24.04",
    disk_format: "qcow2",
    size,
    visibility: "public",
  } as Image;
}

describe("image selection details", () => {
  it("formats the authoritative Glance image size", () => {
    expect(formatImageSelectionSize(1_610_612_736)).toBe("1.5 GB");

    const html = renderToStaticMarkup(
      <ImageSelectOption image={image(1_610_612_736)} />,
    );

    expect(html).toContain("1.5 GB");
    expect(html).toContain("QCOW2");
  });

  it("keeps images with missing or invalid size metadata selectable", () => {
    expect(formatImageSelectionSize(null)).toBe("Size unavailable");
    expect(formatImageSelectionSize(Number.NaN)).toBe("Size unavailable");

    const html = renderToStaticMarkup(<ImageSelectOption image={image(null)} />);
    expect(html).toContain("Size unavailable");
  });
});
