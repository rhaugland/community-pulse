import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/reddit-client";

// GET /api/auth — Redirect to Reddit OAuth2 authorization
export async function GET() {
  const state = Math.random().toString(36).slice(2);
  const url = getAuthUrl(state);
  return NextResponse.redirect(url);
}
