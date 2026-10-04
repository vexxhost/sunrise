import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  cookies: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { readPrefs, writePrefs } from "@/lib/prefs";
import type { PreferenceIdentity } from "@/lib/preference-identity";

const firstIdentity: PreferenceIdentity = {
  issuer: "https://identity.example.test/realms/demo",
  subject: "user-one",
};
const secondIdentity: PreferenceIdentity = {
  issuer: "https://identity.example.test/realms/demo",
  subject: "user-two",
};
const recentInstance = {
  kind: "instance" as const,
  id: "instance-one",
  name: "Instance one",
  projectId: "projectone",
  regionId: "RegionOne",
  updatedAt: 1_000,
};

describe("Sunrise preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValues.clear();
    mocks.get.mockImplementation((name: string) => {
      const value = mocks.cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    });
    mocks.getAll.mockImplementation(() =>
      [...mocks.cookieValues].map(([name, value]) => ({ name, value })),
    );
    mocks.set.mockImplementation((name: string, value: string) => {
      mocks.cookieValues.set(name, value);
    });
    mocks.delete.mockImplementation((name: string) => {
      mocks.cookieValues.delete(name);
    });
    mocks.cookies.mockResolvedValue({
      get: mocks.get,
      getAll: mocks.getAll,
      set: mocks.set,
      delete: mocks.delete,
    });
  });

  it("isolates account preferences by OIDC issuer and subject", async () => {
    await writePrefs(
      {
        projectId: "project-one",
        recentResources: [recentInstance],
        pinnedResources: [recentInstance],
        favoriteDestinations: ["compute.volumes"],
      },
      firstIdentity,
    );

    await expect(readPrefs(secondIdentity)).resolves.toEqual({
      appearance: undefined,
      regionId: undefined,
      projectId: undefined,
      projectName: undefined,
      recentResources: undefined,
      pinnedResources: undefined,
      favoriteDestinations: undefined,
    });
    await expect(readPrefs(firstIdentity)).resolves.toMatchObject({
      projectId: "project-one",
      recentResources: [recentInstance],
      pinnedResources: [recentInstance],
      favoriteDestinations: ["compute.volumes"],
    });

    const accountCookie = mocks.set.mock.calls.find(([name]) =>
      String(name).startsWith("sunrise_prefs_account_"),
    );
    expect(accountCookie?.[0]).not.toContain(firstIdentity.subject);
    expect(accountCookie?.[2]).toMatchObject({ httpOnly: true });
  });

  it("keeps appearance browser-wide without exposing legacy account data", async () => {
    mocks.cookieValues.set(
      "sunrise_prefs",
      JSON.stringify({
        appearance: "dark",
        projectId: "legacy-project",
        recentResources: [recentInstance],
      }),
    );

    await expect(readPrefs(firstIdentity)).resolves.toEqual({
      appearance: "dark",
      regionId: undefined,
      projectId: undefined,
      projectName: undefined,
      recentResources: undefined,
      pinnedResources: undefined,
      favoriteDestinations: undefined,
    });

    await writePrefs({ projectId: "project-one" }, firstIdentity);
    expect(JSON.parse(mocks.cookieValues.get("sunrise_prefs") ?? "{}")).toEqual(
      { appearance: "dark" },
    );
  });

  it("rejects account preference writes without an identity scope", async () => {
    await expect(
      writePrefs({ recentResources: [recentInstance] }),
    ).rejects.toThrow("Account preference writes require an OIDC identity");
  });

  it("bounds retained account cookies and their aggregate value size", async () => {
    const dateNow = vi
      .spyOn(Date, "now")
      .mockImplementationOnce(() => 1)
      .mockImplementationOnce(() => 2)
      .mockImplementationOnce(() => 3)
      .mockImplementationOnce(() => 4);

    for (const subject of ["one", "two", "three", "four"]) {
      await writePrefs(
        {
          recentResources: Array.from({ length: 20 }, (_, index) => ({
            ...recentInstance,
            id: `${subject}-${index}`,
            name: `${subject} ${index}`,
          })),
        },
        { ...firstIdentity, subject },
      );
    }

    const accountCookies = [...mocks.cookieValues]
      .filter(([name]) => name.startsWith("sunrise_prefs_account_"))
      .map(([, value]) => value);
    expect(accountCookies).toHaveLength(3);
    expect(
      accountCookies.every((value) => encodeURIComponent(value).length <= 1200),
    ).toBe(true);
    await expect(
      readPrefs({ ...firstIdentity, subject: "one" }),
    ).resolves.toMatchObject({ recentResources: undefined });
    await expect(
      readPrefs({ ...firstIdentity, subject: "four" }),
    ).resolves.toMatchObject({
      recentResources: expect.arrayContaining([
        expect.objectContaining({ id: "four-0" }),
      ]),
    });

    dateNow.mockRestore();
  });
});
