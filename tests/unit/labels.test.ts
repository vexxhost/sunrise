import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLabelInput } from "@/app/kubernetes/utils/labels";

describe("parseLabelInput", () => {
  it("returns undefined for empty input", () => {
    assert.equal(parseLabelInput(""), undefined);
    assert.equal(parseLabelInput("   "), undefined);
  });

  it("parses valid JSON objects and stringifies values", () => {
    const result = parseLabelInput('{"foo":"bar","count":42}');
    assert.deepEqual(result, { foo: "bar", count: "42" });
  });

  it("returns null for invalid JSON or non-object payloads", () => {
    assert.equal(parseLabelInput("{not-json}"), null);
    assert.equal(parseLabelInput('"hello"'), null);
    assert.equal(parseLabelInput("[1,2,3]"), null);
  });
});

