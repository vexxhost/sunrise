import { NextRequest, NextResponse } from "next/server";
import { session } from "@/lib/session";
import { getImage, updateImage, deleteImage } from "@/lib/glance";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check if user is authenticated
    const projectToken = await session().get("projectToken");
    if (!projectToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const image = await getImage(params.id);
    return NextResponse.json(image);
  } catch (error) {
    console.error("Error fetching image:", error);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Check if user is authenticated
    const projectToken = await session().get("projectToken");
    if (!projectToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const image = await updateImage(params.id, body);
    return NextResponse.json(image);
  } catch (error) {
    console.error("Error updating image:", error);
    return NextResponse.json({ error: "Failed to update image" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Check if user is authenticated
    const projectToken = await session().get("projectToken");
    if (!projectToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await deleteImage(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}