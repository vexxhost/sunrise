import { NextResponse } from "next/server";
import { writePrefs } from "@/lib/prefs";
import { parseSunriseAppearance } from "@/lib/theme-preference";

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appearance = parseSunriseAppearance(
    typeof body === "object" && body !== null && "appearance" in body
      ? body.appearance
      : undefined,
  );
  if (!appearance) {
    return NextResponse.json(
      { error: "Appearance must be system, light, or dark" },
      { status: 400 },
    );
  }

  await writePrefs({ appearance });
  return new Response(null, { status: 204 });
}
