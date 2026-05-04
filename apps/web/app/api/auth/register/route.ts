import { NextResponse } from "next/server";

import {
  attachAdminSessionCookie,
  buildAuthRedirectLocation,
  getSafeNextPath,
  registerAdminUser
} from "../../../../lib/admin-auth";

const readPayload = async (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      approvalCode?: string;
      password?: string;
      confirmPassword?: string;
      next?: string;
    };

    return {
      email: body.email,
      approvalCode: body.approvalCode ?? "",
      password: body.password ?? "",
      confirmPassword: body.confirmPassword ?? "",
      next: body.next
    };
  }

  const formData = await request.formData().catch(() => null);
  return {
    email: typeof formData?.get("email") === "string" ? String(formData?.get("email")) : undefined,
    approvalCode:
      typeof formData?.get("approvalCode") === "string"
        ? String(formData?.get("approvalCode"))
        : "",
    password: typeof formData?.get("password") === "string" ? String(formData?.get("password")) : "",
    confirmPassword:
      typeof formData?.get("confirmPassword") === "string"
        ? String(formData?.get("confirmPassword"))
        : "",
    next: typeof formData?.get("next") === "string" ? String(formData?.get("next")) : undefined
  };
};

const wantsJson = (request: Request) =>
  (request.headers.get("accept") ?? "").includes("application/json") ||
  (request.headers.get("content-type") ?? "").includes("application/json");

export async function POST(request: Request) {
  const payload = await readPayload(request);
  const nextPath = getSafeNextPath(payload.next);

  if (!payload.password) {
    return wantsJson(request)
      ? NextResponse.json({ error: "缺少注册密码" }, { status: 400 })
      : NextResponse.redirect(
          buildAuthRedirectLocation(request, "/auth/register", {
            error: "缺少注册密码",
            next: nextPath,
            email: payload.email?.trim()
          }),
          303
        );
  }

  if (payload.password !== payload.confirmPassword) {
    return wantsJson(request)
      ? NextResponse.json({ error: "两次输入的密码不一致" }, { status: 400 })
      : NextResponse.redirect(
          buildAuthRedirectLocation(request, "/auth/register", {
            error: "两次输入的密码不一致",
            next: nextPath,
            email: payload.email?.trim()
          }),
          303
        );
  }

  try {
    const result = await registerAdminUser(request, {
      email: payload.email,
      approvalCode: payload.approvalCode,
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
    const message = error instanceof Error ? error.message : "注册失败";
    if (wantsJson(request)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.redirect(
      buildAuthRedirectLocation(request, "/auth/register", {
        error: message,
        next: nextPath,
        email: payload.email?.trim()
      }),
      303
    );
  }
}
