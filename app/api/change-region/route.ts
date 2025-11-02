import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const { regionId } = await request.json();
    const session = await getSession();

    if (!regionId) {
      return Response.json(
        { error: 'regionId is required' },
        { status: 400 }
      );
    }

    session.selectedRegion = regionId;
    await session.save();

    return Response.json({ success: true, regionId });
  } catch (error) {
    console.error('Failed to change region:', error);
    return Response.json(
      { error: 'Failed to change region' },
      { status: 500 }
    );
  }
}
