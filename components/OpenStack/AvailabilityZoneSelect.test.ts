import { describe, expect, it } from "vitest";

import {
  availabilityZoneFromSelectValue,
  availabilityZoneSelectValue,
} from "@/components/OpenStack/AvailabilityZoneSelect";

describe("AvailabilityZoneSelect values", () => {
  it("keeps the synthetic cloud default separate from a zone with the same name", () => {
    expect(availabilityZoneSelectValue("")).toBe("cloud-default");
    expect(availabilityZoneSelectValue("cloud-default")).toBe(
      "availability-zone:cloud-default",
    );
    expect(
      availabilityZoneFromSelectValue(
        availabilityZoneSelectValue("cloud-default"),
      ),
    ).toBe("cloud-default");
  });

  it("round trips operator-defined zone names", () => {
    const zone = "availability-zone:edge/west";

    expect(
      availabilityZoneFromSelectValue(availabilityZoneSelectValue(zone)),
    ).toBe(zone);
  });
});
