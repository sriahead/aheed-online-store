import { NextResponse } from "next/server";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const icons = Object.values(ICON_3D_DEFINITIONS).map((icon) => ({
    id: icon.id,
    name: icon.name,
    category: icon.category,
    purpose: icon.purpose,
    recommendedAnim: icon.recommendedAnim,
    tags: icon.tags,
    endpoint: `${baseUrl}/api/icons/${icon.id}`,
    previewUrl: `${baseUrl}/api/icons/${icon.id}?theme=light`,
  }));

  const manifest = {
    name: "Aheed Food Centre 3D Icon API",
    version: "2.0.0",
    description: "Production-ready, theme-aware 3D vector icon service",
    totalIcons: icons.length,
    endpoints: {
      manifest: `${baseUrl}/api/icons`,
      iconSvg: `${baseUrl}/api/icons/[id]`,
    },
    supportedParameters: {
      theme: {
        type: "string",
        enum: ["light", "dark", "auto"],
        default: "auto",
        description: "Enforces light, dark, or automatic system theme colors.",
      },
      primaryColor: {
        type: "string",
        format: "hex",
        example: "059669",
        description:
          "Overrides the primary accent gradient (hex format with or without leading #).",
      },
      animated: {
        type: "boolean",
        default: true,
        description: "Enables or disables subtle floating/popping CSS keyframes.",
      },
      animSpeed: {
        type: "number",
        min: 0.2,
        max: 5.0,
        default: 1.0,
        description: "Speed multiplier for animations.",
      },
      style: {
        type: "string",
        enum: ["3d", "outline"],
        default: "3d",
        description: "3D layered illustration or minimal outline.",
      },
    },
    icons,
  };

  return NextResponse.json(manifest, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
