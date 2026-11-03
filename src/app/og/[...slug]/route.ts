import { renderOg } from "../_render";

/**
 * og:image cards: /og/app, /og/course/MATH111, /og/course-new/CS340,
 * /og/professor/<id>, /og/file/<id>, /og/rate?term=, /og/next/MATH211,
 * /og/anonymous/<id>?c=&t=&r=&s=, /og/telegram.
 * Versioned URLs (?v=) are immutable; unversioned ones are cached for a day.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  const [kind, id] = slug;
  const q = new URL(req.url).searchParams;
  try {
    const png = await renderOg(kind, id ? decodeURIComponent(id) : undefined, q);
    const versioned = q.has("v") || q.has("s");
    return new Response(png as BodyInit, {
      headers: {
        "content-type": "image/png",
        "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    // Never break a share: fall back to the app card.
    const png = await renderOg("app", undefined, new URLSearchParams());
    return new Response(png as BodyInit, { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
  }
}
