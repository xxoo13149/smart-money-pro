import { NextResponse } from "next/server";

import {
  buildAuthRedirectLocation,
  getSafeNextPath,
  requestAdminRegistrationApprovalCode
} from "../../../../lib/admin-auth";

const readPayload = async (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      next?: string;
    };

    return {
      email: body.email,
      next: body.next
    };
  }

  const formData = await request.formData().catch(() => null);
  return {
    email: typeof formData?.get("email") === "string" ? String(formData?.get("email")) : undefined,
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
    const result = await requestAdminRegistrationApprovalCode(request, {
      email: payload.email
    });

    if (wantsJson(request)) {
      return NextResponse.json({
        data: result
      });
    }

    return NextResponse.redirect(
      buildAuthRedirectLocation(request, "/auth/register", {
        next: nextPath,
        email: result.requestedEmail,
        message: `管理员审批码已发送到审批邮箱 ${result.ownerEmailMasked}`
      }),
      303
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "审批码发送失败";
    if (wantsJson(request)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.redirect(
      buildAuthRedirectLocation(request, "/auth/register", {
        next: nextPath,
        email: payload.email?.trim(),
        error: message
      }),
      303
    );
  }
}
