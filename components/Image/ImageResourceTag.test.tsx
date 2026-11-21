import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ImageResourceTag,
  ImageResourceTagList,
} from "@/components/Image/ImageResourceTag";

describe("Image resource tag navigation", () => {
  it("links an exact tag to the filtered image collection", () => {
    const markup = renderToStaticMarkup(
      <ImageResourceTag tag="env:test" />,
    );

    expect(markup).toContain('href="/compute/images?tag=env%3Atest"');
    expect(markup).toContain('aria-label="Show images tagged env:test"');
  });

  it("does not link a tag that cannot be represented exactly", () => {
    const markup = renderToStaticMarkup(<ImageResourceTag tag="" />);

    expect(markup).not.toContain("<a");
    expect(markup).toContain(
      'title="This tag cannot be represented exactly in an image list filter."',
    );
  });

  it("does not link a whitespace-padded tag that Glance would trim", () => {
    const markup = renderToStaticMarkup(<ImageResourceTag tag=" env:test " />);

    expect(markup).not.toContain("<a");
    expect(markup).toContain(
      'title="This tag cannot be represented exactly in an image list filter."',
    );
  });

  it("quotes Python-only edge whitespace and does not link it", () => {
    const markup = renderToStaticMarkup(
      <ImageResourceTag tag={"\u0085env:test"} />,
    );

    expect(markup).not.toContain("<a");
    expect(markup).toContain("&quot;\\u0085env:test&quot;");
  });

  it("uses an accessible overflow trigger for additional table tags", () => {
    const markup = renderToStaticMarkup(
      <ImageResourceTagList
        tags={["env:test", "team:platform", "owner:cloud"]}
      />,
    );

    expect(markup).toContain('aria-label="Show 1 more tag"');
    expect(markup).toContain(">+1</button>");
  });
});
