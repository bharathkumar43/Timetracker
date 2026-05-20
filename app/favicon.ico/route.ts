import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const url = new URL("/favicon.svg", request.url);
  return NextResponse.redirect(url, 301);
}
