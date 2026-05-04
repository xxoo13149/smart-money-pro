import { bootstrapSmartMoneyDb } from "@weather-smart-money/data";
import type { D1Database } from "@cloudflare/workers-types";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";

import { getSmartMoneyBindings, type SmartMoneyBindings } from "./cloudflare-env";

const ACCESS_EMAIL_HEADERS = [
  "cf-access-authenticated-user-email",
  "x-auth-request-email",
  "x-forwarded-email"
] as const;
const ADMIN_SESSION_COOKIE_NAME = "wsm_admin_session";
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_KEY_BITS = 256;
const PASSWORD_SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const DEFAULT_ADMIN_SESSION_TTL_DAYS = 14;
const MIN_ADMIN_SESSION_TTL_DAYS = 7;
const MAX_ADMIN_SESSION_TTL_DAYS = 60;
const DEFAULT_ADMIN_SESSION_TTL_MS = DEFAULT_ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1_000;
const APPROVAL_CODE_DIGITS = 6;
const DEFAULT_APPROVAL_CODE_TTL_MINUTES = 10;
const DEFAULT_APPROVAL_RESEND_COOLDOWN_SECONDS = 60;
const DEFAULT_APPROVAL_OWNER_EMAIL = "owner@example.com";
const DEFAULT_APPROVAL_SENDER_EMAIL = "noreply@example.com";
const DEFAULT_APPROVAL_SENDER_NAME = "Smart Money Admin";
const APPROVAL_SECRET_HEADER = "x-admin-approval-secret";
const SCHEMA_READY = new Map<string, Promise<unknown>>();

interface AdminUserRow {
  id: string;
  email: string;
  normalized_email: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  access_verified_at?: string | null;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
  disabled_at?: string | null;
}

interface AdminSessionRow {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at?: string | null;
  user_email: string;
  user_normalized_email: string;
  user_disabled_at?: string | null;
}

interface AdminRegistrationApprovalRow {
  id: string;
  request_email: string;
  normalized_request_email: string;
  approval_code_hash: string;
  approval_code_salt: string;
  owner_email: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  used_at?: string | null;
  requested_ip?: string | null;
  request_user_agent?: string | null;
  last_sent_at?: string | null;
  send_error?: string | null;
}

export interface AdminSessionContext {
  sessionId: string;
  expiresAt: string;
  lastSeenAt: string;
  user: {
    id: string;
    email: string;
    normalizedEmail: string;
  };
}

export interface AdminRegistrationApprovalConfig {
  enabled: boolean;
  ownerEmail: string;
  ownerEmailMasked: string;
  senderEmail: string;
  senderName: string;
  ttlMinutes: number;
  resendCooldownSeconds: number;
}

export interface AdminAuthState {
  authReady: boolean;
  session: AdminSessionContext | null;
  accessEmail?: string;
  hasAccountForAccessEmail: boolean;
  registrationApproval: AdminRegistrationApprovalConfig;
}

interface AdminAuthRequestState {
  authReady: boolean;
  session: AdminSessionContext | null;
  accessEmail?: string;
  registrationApproval: AdminRegistrationApprovalConfig;
}

const nowIso = () => new Date().toISOString();

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveSessionTtlMs = (bindings?: SmartMoneyBindings | null) => {
  const ttlDays = Math.min(
    MAX_ADMIN_SESSION_TTL_DAYS,
    Math.max(
      MIN_ADMIN_SESSION_TTL_DAYS,
      parsePositiveInt(bindings?.ADMIN_SESSION_TTL_DAYS, DEFAULT_ADMIN_SESSION_TTL_DAYS)
    )
  );

  return ttlDays * 24 * 60 * 60 * 1_000;
};

const encodeHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

const decodeHex = (value: string) =>
  Uint8Array.from((value.match(/.{1,2}/g) ?? []).map((part) => Number.parseInt(part, 16)));

const truncate = (value: string | null, maxLength: number) =>
  value ? value.trim().slice(0, maxLength) : null;

const maskEmail = (value: string) => {
  const normalized = normalizeEmail(value);
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) {
    return normalized;
  }

  if (localPart.length <= 4) {
    return `${localPart[0] ?? "*"}***@${domain}`;
  }

  return `${localPart.slice(0, 4)}***@${domain}`;
};

const extractAccessEmail = (source: Pick<Headers, "get">) => {
  for (const key of ACCESS_EMAIL_HEADERS) {
    const value = source.get(key)?.trim();
    if (value) {
      return normalizeEmail(value);
    }
  }

  return undefined;
};

const extractCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) {
    return undefined;
  }

  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part) {
      continue;
    }

    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    if (part.slice(0, separatorIndex).trim() !== key) {
      continue;
    }

    return decodeURIComponent(part.slice(separatorIndex + 1));
  }

  return undefined;
};

const getSecureRequest = (request: Request) => {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
};

const buildCookieOptions = (request: Request, sessionTtlMs = DEFAULT_ADMIN_SESSION_TTL_MS) => ({
  name: ADMIN_SESSION_COOKIE_NAME,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: getSecureRequest(request),
  path: "/",
  maxAge: Math.floor(sessionTtlMs / 1_000)
});

const setSessionCookie = (
  response: NextResponse,
  request: Request,
  token: string,
  sessionTtlMs = DEFAULT_ADMIN_SESSION_TTL_MS
) => {
  response.cookies.set({
    ...buildCookieOptions(request, sessionTtlMs),
    value: token
  });
};

const clearSessionCookie = (
  response: NextResponse,
  request: Request,
  sessionTtlMs = DEFAULT_ADMIN_SESSION_TTL_MS
) => {
  response.cookies.set({
    ...buildCookieOptions(request, sessionTtlMs),
    value: "",
    maxAge: 0
  });
};

const parseIpAddress = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return (
      forwardedFor
        .split(",")
        .map((part) => part.trim())
        .find(Boolean)
        ?.slice(0, 128) ?? null
    );
  }

  return request.headers.get("cf-connecting-ip")?.trim().slice(0, 128) ?? null;
};

const derivePasswordHash = async (password: string, saltHex: string, iterations: number) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeHex(saltHex),
      iterations
    },
    key,
    PASSWORD_KEY_BITS
  );

  return encodeHex(bits);
};

const createPasswordRecord = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const saltHex = encodeHex(salt.buffer);
  const passwordHash = await derivePasswordHash(password, saltHex, PASSWORD_ITERATIONS);

  return {
    passwordHash,
    passwordSalt: saltHex,
    passwordIterations: PASSWORD_ITERATIONS
  };
};

const hashSessionToken = async (token: string) =>
  encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));

const createSessionToken = () =>
  encodeHex(crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES)).buffer);

const createApprovalCode = () => {
  const randomValues = crypto.getRandomValues(new Uint32Array(1));
  const value = (randomValues[0] ?? 0) % 1_000_000;
  return value.toString().padStart(APPROVAL_CODE_DIGITS, "0");
};

const hashApprovalCode = async (code: string, saltHex: string) =>
  encodeHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${saltHex}:${code.trim()}`))
  );

const buildSessionContext = (row: AdminSessionRow): AdminSessionContext => ({
  sessionId: row.id,
  expiresAt: row.expires_at,
  lastSeenAt: row.last_seen_at,
  user: {
    id: row.user_id,
    email: row.user_email,
    normalizedEmail: row.user_normalized_email
  }
});

const sanitizeNextPath = (value?: string | null) => {
  const candidate = (value ?? "").trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }

  if (candidate.startsWith("/api/auth")) {
    return "/";
  }

  return candidate;
};

const getApprovalConfigFromBindings = (
  bindings: SmartMoneyBindings | null | undefined
): AdminRegistrationApprovalConfig => {
  const ownerEmail = normalizeEmail(
    bindings?.ADMIN_APPROVAL_OWNER_EMAIL?.trim() || DEFAULT_APPROVAL_OWNER_EMAIL
  );
  const senderEmail = normalizeEmail(
    bindings?.ADMIN_APPROVAL_SENDER_EMAIL?.trim() || DEFAULT_APPROVAL_SENDER_EMAIL
  );
  const senderName = bindings?.ADMIN_APPROVAL_SENDER_NAME?.trim() || DEFAULT_APPROVAL_SENDER_NAME;
  const ttlMinutes = parsePositiveInt(
    bindings?.ADMIN_APPROVAL_CODE_TTL_MINUTES,
    DEFAULT_APPROVAL_CODE_TTL_MINUTES
  );
  const resendCooldownSeconds = parsePositiveInt(
    bindings?.ADMIN_APPROVAL_RESEND_COOLDOWN_SECONDS,
    DEFAULT_APPROVAL_RESEND_COOLDOWN_SECONDS
  );

  return {
    enabled: Boolean(
      bindings?.PUBLIC_EXTENSION_BASE_URL &&
        bindings?.ADMIN_APPROVAL_SHARED_SECRET &&
        ownerEmail &&
        senderEmail
    ),
    ownerEmail,
    ownerEmailMasked: maskEmail(ownerEmail),
    senderEmail,
    senderName,
    ttlMinutes,
    resendCooldownSeconds
  };
};

const ensureAuthDb = async () => {
  const bindings = await getSmartMoneyBindings();
  if (!bindings?.SMART_MONEY_DB) {
    return null;
  }

  const scopeKey = [
    bindings.ADMIN_BASE_URL ?? "admin",
    bindings.PUBLIC_EXTENSION_BASE_URL ?? "app"
  ].join("|");
  if (!SCHEMA_READY.has(scopeKey)) {
    SCHEMA_READY.set(scopeKey, bootstrapSmartMoneyDb(bindings.SMART_MONEY_DB));
  }

  await SCHEMA_READY.get(scopeKey)!;

  return {
    db: bindings.SMART_MONEY_DB,
    bindings
  };
};

const findUserByNormalizedEmail = async (db: D1Database, normalizedEmail: string) => {
  const result = await db
    .prepare(
      `SELECT id,
              email,
              normalized_email,
              password_hash,
              password_salt,
              password_iterations,
              access_verified_at,
              created_at,
              updated_at,
              last_login_at,
              disabled_at
       FROM admin_users
       WHERE normalized_email = ?
       LIMIT 1`
    )
    .bind(normalizedEmail)
    .first<AdminUserRow>();

  return result ?? null;
};

const findLatestApprovalByEmail = async (
  db: D1Database,
  normalizedEmail: string
): Promise<AdminRegistrationApprovalRow | null> => {
  const result = await db
    .prepare(
      `SELECT id,
              request_email,
              normalized_request_email,
              approval_code_hash,
              approval_code_salt,
              owner_email,
              created_at,
              updated_at,
              expires_at,
              used_at,
              requested_ip,
              request_user_agent,
              last_sent_at,
              send_error
       FROM admin_registration_approvals
       WHERE normalized_request_email = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(normalizedEmail)
    .first<AdminRegistrationApprovalRow>();

  return result ?? null;
};

const findLatestApprovalByIp = async (
  db: D1Database,
  requestedIp: string
): Promise<AdminRegistrationApprovalRow | null> => {
  const result = await db
    .prepare(
      `SELECT id,
              request_email,
              normalized_request_email,
              approval_code_hash,
              approval_code_salt,
              owner_email,
              created_at,
              updated_at,
              expires_at,
              used_at,
              requested_ip,
              request_user_agent,
              last_sent_at,
              send_error
       FROM admin_registration_approvals
       WHERE requested_ip = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(requestedIp)
    .first<AdminRegistrationApprovalRow>();

  return result ?? null;
};

const findSessionByToken = async (
  db: D1Database,
  token: string
): Promise<AdminSessionRow | null> => {
  const tokenHash = await hashSessionToken(token);
  const result = await db
    .prepare(
      `SELECT s.id,
              s.user_id,
              s.created_at,
              s.updated_at,
              s.last_seen_at,
              s.expires_at,
              s.revoked_at,
              u.email AS user_email,
              u.normalized_email AS user_normalized_email,
              u.disabled_at AS user_disabled_at
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.session_token_hash = ?
       LIMIT 1`
    )
    .bind(tokenHash)
    .first<AdminSessionRow>();

  return result ?? null;
};

const touchSession = async (
  db: D1Database,
  session: AdminSessionRow,
  sessionTtlMs: number
) => {
  const lastSeenAt = Date.parse(session.last_seen_at);
  if (!Number.isNaN(lastSeenAt) && Date.now() - lastSeenAt < SESSION_TOUCH_INTERVAL_MS) {
    return;
  }

  const touchedAt = nowIso();
  const nextExpiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  await db
    .prepare(
      `UPDATE admin_sessions
       SET last_seen_at = ?,
           expires_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(touchedAt, nextExpiresAt, touchedAt, session.id)
    .run();

  session.last_seen_at = touchedAt;
  session.expires_at = nextExpiresAt;
  session.updated_at = touchedAt;
};

const revokeSessionByToken = async (db: D1Database, token: string) => {
  const tokenHash = await hashSessionToken(token);
  const revokedAt = nowIso();
  await db
    .prepare(
      `UPDATE admin_sessions
       SET revoked_at = ?,
           updated_at = ?
       WHERE session_token_hash = ?
         AND revoked_at IS NULL`
    )
    .bind(revokedAt, revokedAt, tokenHash)
    .run();
};

const createSessionRecord = async (
  db: D1Database,
  request: Request,
  user: AdminUserRow,
  sessionTtlMs: number
): Promise<{ token: string; session: AdminSessionContext }> => {
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  const sessionId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO admin_sessions (
         id,
         user_id,
         session_token_hash,
         created_at,
         updated_at,
         last_seen_at,
         expires_at,
         ip_address,
         user_agent
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      sessionId,
      user.id,
      tokenHash,
      createdAt,
      createdAt,
      createdAt,
      expiresAt,
      parseIpAddress(request),
      truncate(request.headers.get("user-agent"), 500)
    )
    .run();

  return {
    token,
    session: {
      sessionId,
      expiresAt,
      lastSeenAt: createdAt,
      user: {
        id: user.id,
        email: user.email,
        normalizedEmail: user.normalized_email
      }
    }
  };
};

const resolveLoginEmail = (request: Request, submittedEmail?: string | null) => {
  const accessEmail = getAccessVerifiedEmailFromRequest(request);
  const normalizedSubmitted = submittedEmail ? normalizeEmail(submittedEmail) : undefined;

  if (accessEmail) {
    if (normalizedSubmitted && normalizedSubmitted !== accessEmail) {
      throw new Error("登录邮箱必须与当前 Cloudflare Access 验证邮箱一致");
    }

    return accessEmail;
  }

  return normalizedSubmitted;
};

const resolveRegistrationEmail = (request: Request, submittedEmail?: string | null) => {
  const accessEmail = getAccessVerifiedEmailFromRequest(request);
  const normalizedSubmitted = submittedEmail ? normalizeEmail(submittedEmail) : undefined;

  if (!accessEmail) {
    throw new Error("请先通过 Cloudflare Access 完成邮箱验证码验证");
  }

  if (normalizedSubmitted && normalizedSubmitted !== accessEmail) {
    throw new Error("注册邮箱必须与当前 Cloudflare Access 验证邮箱一致");
  }

  return accessEmail;
};

const describeCooldownRemaining = (lastSentAt: string, cooldownSeconds: number) => {
  const remainingMs = cooldownSeconds * 1_000 - (Date.now() - Date.parse(lastSentAt));
  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / 1_000);
};

const sendOwnerApprovalCodeEmail = async (
  bindings: SmartMoneyBindings,
  config: AdminRegistrationApprovalConfig,
  input: {
    requestEmail: string;
    approvalCode: string;
    requestedAt: string;
    requestedIp: string | null;
    accessEmail?: string;
  }
) => {
  const approvalBaseUrl = bindings.PUBLIC_EXTENSION_BASE_URL?.replace(/\/$/, "");
  const approvalSecret = bindings.ADMIN_APPROVAL_SHARED_SECRET?.trim();

  if (!approvalBaseUrl || !approvalSecret || !config.enabled) {
    throw new Error("管理员审批邮件能力尚未配置完成");
  }

  const response = await fetch(`${approvalBaseUrl}/api/internal/admin/send-approval-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [APPROVAL_SECRET_HEADER]: approvalSecret
    },
    body: JSON.stringify({
      requestEmail: input.requestEmail,
      approvalCode: input.approvalCode,
      requestedAt: input.requestedAt,
      requestedIp: input.requestedIp,
      accessEmail: input.accessEmail,
      ttlMinutes: config.ttlMinutes
    }),
    cache: "no-store"
  });

  if (response.ok) {
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json().catch(() => null)) as { error?: string } | null)
    : null;
  throw new Error(payload?.error || `mail dispatch failed with status ${response.status}`);
};

const resolveSessionFromRequest = async (
  request: Request
): Promise<{
  session: AdminSessionContext | null;
  accessEmail?: string;
  shouldClearCookie: boolean;
}> => {
  const auth = await ensureAuthDb();
  const accessEmail = getAccessVerifiedEmailFromRequest(request);
  const sessionToken = extractCookieValue(request.headers.get("cookie"), ADMIN_SESSION_COOKIE_NAME);

  if (!auth || !sessionToken) {
    return {
      session: null,
      accessEmail,
      shouldClearCookie: Boolean(sessionToken)
    };
  }

  const row = await findSessionByToken(auth.db, sessionToken);
  if (!row) {
    return {
      session: null,
      accessEmail,
      shouldClearCookie: true
    };
  }

  if (row.revoked_at || row.user_disabled_at || Date.parse(row.expires_at) <= Date.now()) {
    return {
      session: null,
      accessEmail,
      shouldClearCookie: true
    };
  }

  const sessionTtlMs = resolveSessionTtlMs(auth.bindings);
  await touchSession(auth.db, row, sessionTtlMs);

  return {
    session: buildSessionContext(row),
    accessEmail,
    shouldClearCookie: false
  };
};

export const getAccessVerifiedEmailFromRequest = (request: Request) =>
  extractAccessEmail(request.headers);

export const getAccessVerifiedEmail = async () => extractAccessEmail(await headers());

const resolveAdminRequestState = cache(async (): Promise<AdminAuthRequestState> => {
  const auth = await ensureAuthDb();
  const headerStore = await headers();
  const cookieStore = await cookies();
  const accessEmail = extractAccessEmail(headerStore);
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const registrationApproval = getApprovalConfigFromBindings(auth?.bindings);

  if (!auth) {
    return {
      authReady: false,
      session: null,
      accessEmail,
      registrationApproval
    };
  }

  let session: AdminSessionContext | null = null;
  if (sessionToken) {
    const row = await findSessionByToken(auth.db, sessionToken);
    if (row && !row.revoked_at && !row.user_disabled_at && Date.parse(row.expires_at) > Date.now()) {
      await touchSession(auth.db, row, resolveSessionTtlMs(auth.bindings));
      session = buildSessionContext(row);
    }
  }

  return {
    authReady: true,
    session,
    accessEmail,
    registrationApproval
  };
});

const resolveHasAccountForAccessEmail = cache(async (accessEmail?: string) => {
  if (!accessEmail) {
    return false;
  }

  const auth = await ensureAuthDb();
  if (!auth) {
    return false;
  }

  return Boolean(await findUserByNormalizedEmail(auth.db, accessEmail));
});

export const getAdminAuthState = async (): Promise<AdminAuthState> => {
  const state = await resolveAdminRequestState();
  const hasAccountForAccessEmail =
    state.authReady && !state.session && state.accessEmail
      ? await resolveHasAccountForAccessEmail(state.accessEmail)
      : false;

  return {
    ...state,
    hasAccountForAccessEmail
  };
};

export const requireAdminPageSession = async (nextPath = "/") => {
  const state = await resolveAdminRequestState();
  if (state.session) {
    return state.session;
  }

  const hasAccountForAccessEmail =
    state.authReady && state.accessEmail
      ? await resolveHasAccountForAccessEmail(state.accessEmail)
      : false;
  const target = state.accessEmail
    ? hasAccountForAccessEmail
      ? "/auth/login"
      : "/auth/register"
    : "/auth/login";
  const search = new URLSearchParams({
    next: sanitizeNextPath(nextPath)
  });

  if (!state.accessEmail) {
    search.set("reason", "access");
  }

  redirect(`${target}?${search.toString()}`);
};

export const requireAdminApiSession = async (request: Request) => {
  const result = await resolveSessionFromRequest(request);
  if (result.session) {
    return {
      ok: true as const,
      session: result.session
    };
  }

  const response = NextResponse.json(
    {
      error: result.accessEmail
        ? "admin session required"
        : "access verification or admin session required"
    },
    { status: 401 }
  );
  if (result.shouldClearCookie) {
    clearSessionCookie(response, request);
  }

  return {
    ok: false as const,
    response
  };
};

export const requestAdminRegistrationApprovalCode = async (
  request: Request,
  input: {
    email?: string | null;
  }
) => {
  const auth = await ensureAuthDb();
  if (!auth) {
    throw new Error("admin auth storage is unavailable");
  }

  const registrationApproval = getApprovalConfigFromBindings(auth.bindings);
  if (!registrationApproval.enabled) {
    throw new Error("管理员审批邮件尚未配置完成");
  }

  const normalizedEmail = resolveRegistrationEmail(request, input.email);
  if (!normalizedEmail) {
    throw new Error("请先填写注册邮箱");
  }

  const existing = await findUserByNormalizedEmail(auth.db, normalizedEmail);
  if (existing?.disabled_at) {
    throw new Error("该邮箱对应的账号已被禁用");
  }
  if (existing) {
    throw new Error("该邮箱已经注册，请直接登录");
  }

  const requestedIp = parseIpAddress(request);
  const latestByEmail = await findLatestApprovalByEmail(auth.db, normalizedEmail);
  if (latestByEmail?.last_sent_at) {
    const remaining = describeCooldownRemaining(
      latestByEmail.last_sent_at,
      registrationApproval.resendCooldownSeconds
    );
    if (remaining > 0) {
      throw new Error(`审批码发送过于频繁，请 ${remaining} 秒后再试`);
    }
  }

  if (requestedIp) {
    const latestByIp = await findLatestApprovalByIp(auth.db, requestedIp);
    if (latestByIp?.last_sent_at) {
      const remaining = describeCooldownRemaining(
        latestByIp.last_sent_at,
        registrationApproval.resendCooldownSeconds
      );
      if (remaining > 0) {
        throw new Error(`当前网络请求过于频繁，请 ${remaining} 秒后再试`);
      }
    }
  }

  const approvalCode = createApprovalCode();
  const approvalSalt = encodeHex(crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES)).buffer);
  const approvalHash = await hashApprovalCode(approvalCode, approvalSalt);
  const createdAt = nowIso();
  const expiresAt = new Date(
    Date.now() + registrationApproval.ttlMinutes * 60 * 1_000
  ).toISOString();
  const approvalId = crypto.randomUUID();

  await auth.db
    .prepare(
      `INSERT INTO admin_registration_approvals (
         id,
         request_email,
         normalized_request_email,
         approval_code_hash,
         approval_code_salt,
         owner_email,
         created_at,
         updated_at,
         expires_at,
         used_at,
         requested_ip,
         request_user_agent,
         last_sent_at,
         send_error
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      approvalId,
      normalizedEmail,
      normalizedEmail,
      approvalHash,
      approvalSalt,
      registrationApproval.ownerEmail,
      createdAt,
      createdAt,
      expiresAt,
      null,
      requestedIp,
      truncate(request.headers.get("user-agent"), 500),
      null,
      null
    )
    .run();

  try {
    await sendOwnerApprovalCodeEmail(auth.bindings, registrationApproval, {
      requestEmail: normalizedEmail,
      approvalCode,
      requestedAt: createdAt,
      requestedIp,
      accessEmail: getAccessVerifiedEmailFromRequest(request)
    });

    await auth.db
      .prepare(
        `UPDATE admin_registration_approvals
         SET updated_at = ?,
             last_sent_at = ?,
             send_error = NULL
         WHERE id = ?`
      )
      .bind(createdAt, createdAt, approvalId)
      .run();
  } catch (error) {
    const message = truncate(
      error instanceof Error ? error.message : "unknown email delivery error",
      500
    );
    await auth.db
      .prepare(
        `UPDATE admin_registration_approvals
         SET updated_at = ?,
             send_error = ?
         WHERE id = ?`
      )
      .bind(nowIso(), message, approvalId)
      .run();

    throw new Error("管理员审批码发送失败，请稍后再试");
  }

  return {
    requestedEmail: normalizedEmail,
    ownerEmailMasked: registrationApproval.ownerEmailMasked,
    expiresAt
  };
};

export const registerAdminUser = async (
  request: Request,
  input: {
    email?: string | null;
    approvalCode: string;
    password: string;
  }
) => {
  const auth = await ensureAuthDb();
  if (!auth) {
    throw new Error("admin auth storage is unavailable");
  }

  const normalizedEmail = resolveRegistrationEmail(request, input.email);
  if (!normalizedEmail) {
    throw new Error("请先填写注册邮箱");
  }

  const approvalCode = input.approvalCode?.trim() ?? "";
  if (!approvalCode) {
    throw new Error("请输入管理员审批码");
  }

  const password = input.password ?? "";
  if (password.length < 8) {
    throw new Error("密码至少需要 8 位");
  }

  const existing = await findUserByNormalizedEmail(auth.db, normalizedEmail);
  if (existing?.disabled_at) {
    throw new Error("该邮箱对应的账号已被禁用");
  }
  if (existing) {
    throw new Error("该邮箱已经注册，请直接登录");
  }

  const approval = await findLatestApprovalByEmail(auth.db, normalizedEmail);
  if (!approval || !approval.last_sent_at || approval.send_error) {
    throw new Error("请先申请管理员审批码");
  }
  if (approval.used_at) {
    throw new Error("该审批码已经使用，请重新申请");
  }
  if (Date.parse(approval.expires_at) <= Date.now()) {
    throw new Error("管理员审批码已过期，请重新申请");
  }

  const approvalHash = await hashApprovalCode(approvalCode, approval.approval_code_salt);
  if (approvalHash !== approval.approval_code_hash) {
    throw new Error("管理员审批码不正确");
  }

  const createdAt = nowIso();
  const userId = crypto.randomUUID();
  const passwordRecord = await createPasswordRecord(password);
  const accessVerifiedEmail = getAccessVerifiedEmailFromRequest(request) ?? null;

  await auth.db
    .prepare(
      `INSERT INTO admin_users (
         id,
         email,
         normalized_email,
         password_hash,
         password_salt,
         password_iterations,
         access_verified_at,
         created_at,
         updated_at,
         last_login_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      normalizedEmail,
      normalizedEmail,
      passwordRecord.passwordHash,
      passwordRecord.passwordSalt,
      passwordRecord.passwordIterations,
      accessVerifiedEmail,
      createdAt,
      createdAt,
      createdAt
    )
    .run();

  await auth.db
    .prepare(
      `UPDATE admin_registration_approvals
       SET updated_at = ?,
           used_at = ?
       WHERE id = ?`
    )
    .bind(createdAt, createdAt, approval.id)
    .run();

  const createdUser: AdminUserRow = {
    id: userId,
    email: normalizedEmail,
    normalized_email: normalizedEmail,
    password_hash: passwordRecord.passwordHash,
    password_salt: passwordRecord.passwordSalt,
    password_iterations: passwordRecord.passwordIterations,
    access_verified_at: accessVerifiedEmail,
    created_at: createdAt,
    updated_at: createdAt,
    last_login_at: createdAt,
    disabled_at: null
  };

  return createSessionRecord(auth.db, request, createdUser, resolveSessionTtlMs(auth.bindings));
};

export const loginAdminUser = async (
  request: Request,
  input: {
    email?: string | null;
    password: string;
  }
) => {
  const auth = await ensureAuthDb();
  if (!auth) {
    throw new Error("admin auth storage is unavailable");
  }

  const normalizedEmail = resolveLoginEmail(request, input.email);
  if (!normalizedEmail) {
    throw new Error("缺少登录邮箱");
  }

  const password = input.password ?? "";
  if (!password) {
    throw new Error("缺少登录密码");
  }

  const user = await findUserByNormalizedEmail(auth.db, normalizedEmail);
  if (!user) {
    throw new Error("账号不存在，请先注册");
  }
  if (user.disabled_at) {
    throw new Error("该账号已被禁用");
  }

  const passwordHash = await derivePasswordHash(
    password,
    user.password_salt,
    Number(user.password_iterations ?? PASSWORD_ITERATIONS)
  );
  if (passwordHash !== user.password_hash) {
    throw new Error("密码不正确");
  }

  const loggedAt = nowIso();
  const accessVerifiedEmail = getAccessVerifiedEmailFromRequest(request) ?? null;
  await auth.db
    .prepare(
      `UPDATE admin_users
       SET updated_at = ?,
           last_login_at = ?,
           access_verified_at = coalesce(?, access_verified_at)
       WHERE id = ?`
    )
    .bind(loggedAt, loggedAt, accessVerifiedEmail, user.id)
    .run();

  return createSessionRecord(auth.db, request, {
    ...user,
    updated_at: loggedAt,
    last_login_at: loggedAt,
    access_verified_at: accessVerifiedEmail ?? user.access_verified_at
  }, resolveSessionTtlMs(auth.bindings));
};

export const logoutAdminSession = async (request: Request) => {
  const auth = await ensureAuthDb();
  const token = extractCookieValue(request.headers.get("cookie"), ADMIN_SESSION_COOKIE_NAME);
  if (auth && token) {
    await revokeSessionByToken(auth.db, token);
  }
};

export const attachAdminSessionCookie = async (
  response: NextResponse,
  request: Request,
  token: string
) => {
  const bindings = await getSmartMoneyBindings();
  setSessionCookie(response, request, token, resolveSessionTtlMs(bindings));
};

export const clearAdminSessionCookie = (response: NextResponse, request: Request) => {
  clearSessionCookie(response, request);
};

export const getAdminLayoutState = async (): Promise<AdminAuthState> => {
  const state = await resolveAdminRequestState();
  return {
    ...state,
    hasAccountForAccessEmail: false
  };
};

export const getAdminSessionSnapshot = async () => {
  const state = await getAdminAuthState();
  return {
    authReady: state.authReady,
    accessEmail: state.accessEmail,
    hasAccountForAccessEmail: state.hasAccountForAccessEmail,
    registrationApproval: state.registrationApproval,
    session: state.session
  };
};

export const buildAuthRedirectLocation = (
  request: Request,
  pathname: string,
  params?: Record<string, string | undefined>
) => {
  const url = new URL(pathname, request.url);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return url;
};

export const getSafeNextPath = sanitizeNextPath;
