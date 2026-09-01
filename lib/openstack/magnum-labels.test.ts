import { describe, expect, it } from "vitest";

import {
  MAGNUM_DRIVER_LABELS,
  magnumCloudProviderTag,
  magnumDriverLabelValue,
} from "./magnum-labels";

describe("magnum label defaults", () => {
  it("matches the cloud-provider versions selected by the driver", () => {
    expect(magnumCloudProviderTag("v1.31.7")).toBe("v1.31.4");
    expect(magnumCloudProviderTag("1.35.4")).toBe("v1.35.0");
    expect(magnumCloudProviderTag("invalid")).toBe("v1.35.0");
  });

  it("uses an explicit cloud-provider override", () => {
    const spec = MAGNUM_DRIVER_LABELS.find(
      ({ key }) => key === "cloud_provider_tag",
    );
    expect(spec).toBeDefined();
    expect(
      magnumDriverLabelValue(
        { kube_tag: "v1.35.4", cloud_provider_tag: "v1.34.9" },
        spec!,
      ),
    ).toEqual({ explicit: true, value: "v1.34.9" });
  });
});
