import { NextResponse } from "next/server";

import {
  buildAuthRedirectLocation,
  clearAdminSessionCookie,
  logoutAdminSession
} from "../../../../lib/admin-auth";

const wantsJson = (request: Request) =>
  (request.headers.get("accept") ?? "").includes("application/json") ||
  (request.headers.get("content-type") ?? "").includes("application/json");

export async function POST(request: Request) {
  await logoutAdminSession(request);

  if (wantsJson(request)) {
    const response = NextResponse.json({ ok: true });
    clearAdminSessionCookie(response, request);
    return response;
  }

  const response = NextResponse.redirect(
    buildAuthRedirectLocation(request, "/auth/login", {
      message: "已退出登录"
    }),
    303
  );
  clearAdminSessionCookie(response, request);
  return response;
}
