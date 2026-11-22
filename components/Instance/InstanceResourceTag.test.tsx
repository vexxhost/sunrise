import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InstanceResourceTag,
  InstanceResourceTagList,
} from "@/components/Instance/InstanceResourceTag";

describe("instance resource tag navigation", () => {
  it("links an exact tag to the filtered instance collection", () => {
    const markup = renderToStaticMarkup(<InstanceResourceTag tag="env:test" />);

    expect(markup).toContain('href="/compute/instances?tag=env%3Atest"');
    expect(markup).toContain('aria-label="Show instances tagged env:test"');
  });

  it.each(["", "[", "*", "[]", "\\c", "(?<name>x)"])(
    "does not link a tag that cannot be represented exactly: %s",
    (tag) => {
      const markup = renderToStaticMarkup(<InstanceResourceTag tag={tag} />);

      expect(markup).not.toContain("<a");
      expect(markup).toContain(
        'title="This tag cannot be represented exactly in an instance list filter."',
      );
    },
  );

  it("uses an accessible overflow trigger for additional table tags", () => {
    const markup = renderToStaticMarkup(
      <InstanceResourceTagList
        tags={["env:test", "team:platform", "owner:cloud"]}
      />,
    );

    expect(markup).toContain('aria-label="Show 1 more tag"');
    expect(markup).toContain(">+1</button>");
  });
});
