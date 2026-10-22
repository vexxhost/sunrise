import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { EditorState } from "@uiw/react-codemirror";

const lockfile = readFileSync(resolve(process.cwd(), "pnpm-lock.yaml"), "utf8");

function resolvedVersions(packageName: string) {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  '${escapedName}@([^']+)':$`, "gm");

  return new Set([...lockfile.matchAll(pattern)].map((match) => match[1]));
}

describe("JsonEditor dependency graph", () => {
  it.each([
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/state",
    "@codemirror/view",
  ])("resolves one %s version", (packageName) => {
    expect([...resolvedVersions(packageName)]).toHaveLength(1);
  });

  it("keeps JSON parsing and diagnostics active", () => {
    const jsonSupport = json();
    const tree = jsonSupport.language.parser.parse('{"enabled": true}');
    const nodeNames: string[] = [];
    const cursor = tree.cursor();

    do {
      nodeNames.push(cursor.name);
    } while (cursor.next());

    expect(nodeNames).toEqual(expect.arrayContaining(["PropertyName", "True"]));

    const state = EditorState.create({
      doc: '{"enabled":',
      extensions: [jsonSupport],
    });
    const diagnostics = jsonParseLinter()({ state } as never);

    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: "error" }),
    ]);
  });
});
