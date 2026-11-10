import { NextResponse } from "next/server";
import { getModeratedSubs, hasAuth } from "@/lib/reddit-client";

// GET /api/subreddits — List subreddits the user moderates
export async function GET() {
  if (!hasAuth()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const subs = await getModeratedSubs();
    return NextResponse.json(
      { subreddits: subs },
      { headers: { "X-Data-TTL": "24h" } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
