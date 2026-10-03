import { describe, expect, it, vi } from "vitest";

import { preventWizardFormSubmit } from "@/components/ui/wizard-form";

describe("preventWizardFormSubmit", () => {
  it("blocks native form submission from wizard inputs", () => {
    const preventDefault = vi.fn();

    preventWizardFormSubmit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
