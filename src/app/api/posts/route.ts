import { NextResponse } from "next/server";
import { fetchPosts, getAllCachedPosts, hasAuth } from "@/lib/reddit-client";

// GET /api/posts?sub=wellthatsucks&limit=25
// Or GET /api/posts (returns all cached posts across subreddits)
export async function GET(request: Request) {
  if (!hasAuth()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sub = searchParams.get("sub");

  try {
    if (sub) {
      const limit = parseInt(searchParams.get("limit") || "25", 10);
      const posts = await fetchPosts(sub, limit);
      return NextResponse.json(
        { posts, count: posts.length },
        { headers: { "X-Data-TTL": "24h" } }
      );
    }

    // Return all cached posts for aggregate view
    const posts = getAllCachedPosts();
    return NextResponse.json(
      { posts, count: posts.length },
      { headers: { "X-Data-TTL": "24h" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
