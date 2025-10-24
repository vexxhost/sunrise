import { NextRequest, NextResponse } from "next/server";
import { session } from "@/lib/session";
import { listImages, getImage, createImage, updateImage, deleteImage, ImageListParams } from "@/lib/glance";

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const projectToken = await session().get("projectToken");
    if (!projectToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params: ImageListParams = {};

    // Parse query parameters
    if (searchParams.has('limit')) params.limit = parseInt(searchParams.get('limit')!);
    if (searchParams.has('marker')) params.marker = searchParams.get('marker')!;
    if (searchParams.has('sort_key')) params.sort_key = searchParams.get('sort_key')!;
    if (searchParams.has('sort_dir')) params.sort_dir = searchParams.get('sort_dir')! as 'asc' | 'desc';
    if (searchParams.has('name')) params.name = searchParams.get('name')!;
    if (searchParams.has('visibility')) params.visibility = searchParams.get('visibility')! as any;
    if (searchParams.has('status')) params.status = searchParams.get('status')!;
    if (searchParams.has('owner')) params.owner = searchParams.get('owner')!;

    const images = await listImages(params);
    return NextResponse.json(images);
  } catch (error) {
    console.error("Error fetching images:", error);
    return NextResponse.json({ error: "Failed to fetch images" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated
    const projectToken = await session().get("projectToken");
    if (!projectToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const image = await createImage(body);
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    console.error("Error creating image:", error);
    return NextResponse.json({ error: "Failed to create image" }, { status: 500 });
  }
}