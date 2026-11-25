import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  octaviaTagDraft,
  octaviaTagsFromDrafts,
  OctaviaTagList,
  OctaviaTagsEditor,
} from "@/components/LoadBalancer/OctaviaTags";
import { validateOctaviaTags } from "@/lib/openstack/octavia-tags";

describe("OctaviaTagList", () => {
  it("renders exact tag values without hiding ambiguous whitespace", () => {
    const markup = renderToStaticMarkup(
      <OctaviaTagList tags={["env:test", " leading space"]} />,
    );

    expect(markup).toContain("env:test");
    expect(markup).toContain("&quot; leading space&quot;");
  });

  it("renders an explicit empty state", () => {
    expect(renderToStaticMarkup(<OctaviaTagList tags={[]} />)).toContain(
      "None",
    );
  });

  it("distinguishes omitted tags from an empty set", () => {
    expect(renderToStaticMarkup(<OctaviaTagList />)).toContain("Unavailable");
  });
});

describe("OctaviaTagsEditor", () => {
  it("renders a multiline draft without putting carriage returns in the field", () => {
    const draft = octaviaTagDraft("first\r\nsecond\nliteral\\r\rend");
    const markup = renderToStaticMarkup(
      <OctaviaTagsEditor idPrefix="tag" onChange={() => {}} tags={[draft]} />,
    );

    expect(markup).toContain("<textarea");
    expect(markup).toContain(
      ">first\\r\nsecond\nliteral\\\\r\\rend</textarea>",
    );
  });

  it("preserves line endings and backslashes after editing a stored tag", () => {
    const original = "\nfirst\r\nsecond\nliteral\\r\rend ";
    const draft = octaviaTagDraft(original);
    expect(octaviaTagsFromDrafts([draft])).toEqual([original]);

    expect(
      octaviaTagsFromDrafts([
        { ...draft, text: draft.text.replace("second", "changed") },
        octaviaTagDraft(),
        octaviaTagDraft("\n"),
      ]),
    ).toEqual(["\nfirst\r\nchanged\nliteral\\r\rend ", "\n"]);
  });

  it("validates decoded length without truncating escape sequences", () => {
    const atLimit = "\\".repeat(58) + "\r\n";
    const tooLong = atLimit + "x";

    expect(
      validateOctaviaTags(octaviaTagsFromDrafts([octaviaTagDraft(atLimit)])),
    ).toEqual({ ok: true, tags: [atLimit] });
    const tags = octaviaTagsFromDrafts([octaviaTagDraft(tooLong)]);
    expect(tags).toEqual([tooLong]);
    expect(validateOctaviaTags(tags)).toMatchObject({ ok: false });
  });
});
