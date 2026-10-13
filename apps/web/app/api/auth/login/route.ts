import { NextResponse } from "next/server";

import {
  attachAdminSessionCookie,
  buildAuthRedirectLocation,
  getSafeNextPath,
  loginAdminUser
} from "../../../../lib/admin-auth";

const readPayload = async (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      next?: string;
    };

    return {
      email: body.email,
      password: body.password ?? "",
      next: body.next
    };
  }

  const formData = await request.formData().catch(() => null);
  return {
    email: typeof formData?.get("email") === "string" ? String(formData?.get("email")) : undefined,
    password: typeof formData?.get("password") === "string" ? String(formData?.get("password")) : "",
    next: typeof formData?.get("next") === "string" ? String(formData?.get("next")) : undefined
  };
};

const wantsJson = (request: Request) =>
  (request.headers.get("accept") ?? "").includes("application/json") ||
  (request.headers.get("content-type") ?? "").includes("application/json");

export async function POST(request: Request) {
  const payload = await readPayload(request);
  const nextPath = getSafeNextPath(payload.next);

  try {
    const result = await loginAdminUser(request, {
      email: payload.email,
      password: payload.password
    });

    if (wantsJson(request)) {
      const response = NextResponse.json({
        data: {
          session: result.session
        }
      });
      await attachAdminSessionCookie(response, request, result.token);
      return response;
    }

    const response = NextResponse.redirect(buildAuthRedirectLocation(request, nextPath), 303);
    await attachAdminSessionCookie(response, request, result.token);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败";
    if (wantsJson(request)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.redirect(
      buildAuthRedirectLocation(request, "/auth/login", {
        error: message,
        next: nextPath
      }),
      303
    );
  }
}
