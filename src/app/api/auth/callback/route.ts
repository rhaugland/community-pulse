import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/reddit-client";

// GET /api/auth/callback — Reddit OAuth2 callback
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?auth=denied", request.url));
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(new URL("/?auth=success", request.url));
  } catch {
    return NextResponse.redirect(new URL("/?auth=error", request.url));
  }
}
