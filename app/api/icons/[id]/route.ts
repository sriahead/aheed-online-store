import { NextResponse } from "next/server";
import { ICON_3D_DEFINITIONS } from "@/lib/icons-3d/catalog";
import { renderIconSvg } from "@/lib/icons-3d/render";
import { ApiIconQuerySchema } from "@/lib/icons-3d/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  // Verify icon existence
  const definition = ICON_3D_DEFINITIONS[id];
  if (!definition) {
    return NextResponse.json(
      {
        error: "Icon not found",
        requestedId: id,
        availableIcons: Object.keys(ICON_3D_DEFINITIONS),
      },
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  // Parse and validate query parameters
  const url = new URL(request.url);
  const queryObj = Object.fromEntries(url.searchParams.entries());

  const parsed = ApiIconQuerySchema.safeParse(queryObj);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: parsed.error.format(),
      },
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const { theme, primaryColor, animated, animSpeed, style } = parsed.data;

  const result = renderIconSvg(definition, {
    theme,
    primaryColor,
    animated,
    animSpeed,
    style,
    idPrefix: `api-${id}`,
  });

  if (!result) {
    return NextResponse.json({ error: "Failed to render icon" }, { status: 500 });
  }

  return new Response(result.svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      Vary: "Accept-Encoding",
    },
  });
}
