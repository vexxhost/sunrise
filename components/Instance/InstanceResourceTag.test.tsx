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

  it("does not link an invalid empty tag", () => {
    const markup = renderToStaticMarkup(<InstanceResourceTag tag="" />);

    expect(markup).not.toContain("<a");
    expect(markup).toContain(
      'title="This tag cannot be represented exactly in an instance list filter."',
    );
  });

  it.each(["[", "*", "(?i)env", "(?P<name>x)"])(
    "links every legal opaque tag without browser regex parsing: %s",
    (tag) => {
      const markup = renderToStaticMarkup(<InstanceResourceTag tag={tag} />);

      expect(markup).toContain("<a");
      expect(markup).toContain("/compute/instances?tag=");
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
