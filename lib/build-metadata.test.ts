import { describe, expect, it, vi } from "vitest";
import {
  BUILD_DEPLOYMENT_ID_FILE,
  readBuildDeploymentId,
} from "@/lib/build-metadata";

vi.mock("server-only", () => ({}));

describe("embedded build metadata", () => {
  it("reads and trims the immutable deployment ID", () => {
    const readFile = vi.fn(() => Buffer.from("release-123\n"));

    expect(readBuildDeploymentId(readFile)).toBe("release-123");
    expect(readFile).toHaveBeenCalledWith(BUILD_DEPLOYMENT_ID_FILE);
  });

  it("allows source-tree runtimes without image metadata", () => {
    const error = Object.assign(new Error("not found"), { code: "ENOENT" });

    expect(
      readBuildDeploymentId(() => {
        throw error;
      }),
    ).toBeUndefined();
  });

  it("reports unreadable image metadata", () => {
    expect(() =>
      readBuildDeploymentId(() => {
        throw new Error("permission denied");
      }),
    ).toThrow(
      "Unable to read embedded Sunrise deployment ID: permission denied",
    );
  });

  it("rejects empty image metadata", () => {
    expect(() => readBuildDeploymentId(() => Buffer.from("\n"))).toThrow(
      "Unable to read embedded Sunrise deployment ID: embedded Sunrise deployment ID is empty",
    );
  });
});
