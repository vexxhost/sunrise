import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/lib/client-clipboard";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await copyTextToClipboard("https://sunrise.example.test/sign-in/demo");

    expect(writeText).toHaveBeenCalledWith(
      "https://sunrise.example.test/sign-in/demo",
    );
  });

  it("falls back to a selected textarea when the first Clipboard API call fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("not focused"));
    const focus = vi.fn();
    const select = vi.fn();
    const remove = vi.fn();
    const textArea = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus,
      select,
      remove,
    };
    const appendChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", {
      activeElement: null,
      createElement: vi.fn().mockReturnValue(textArea),
      body: { appendChild },
      execCommand,
    });

    await copyTextToClipboard("https://sunrise.example.test/sign-in/demo");

    expect(textArea.value).toBe("https://sunrise.example.test/sign-in/demo");
    expect(appendChild).toHaveBeenCalledWith(textArea);
    expect(focus).toHaveBeenCalled();
    expect(select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(remove).toHaveBeenCalled();
  });
});
