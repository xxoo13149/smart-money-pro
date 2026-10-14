import { EmailMessage } from "cloudflare:email";
import {
  normalizeAddress,
  type ExtensionHealthRequest,
  type ExtensionHealthResponse,
  type AddressSearchResult,
  type NormalizedAddress
} from "@weather-smart-money/core";
import {
  bindExtensionUserInvite,
  createExtensionSession,
  createExtensionUser,
  getDatasetVersion,
  getExtensionInvite,
  getExtensionSessionById,
  getExtensionSessionByRefreshHash,
  getExtensionUserByInviteCode,
  getExtensionUserByNormalizedEmail,
  getCityWinRatePayload,
  listAddressSummaries,
  markExtensionInviteUsed,
  revokeExtensionSession,
  searchAddressSummaries,
  setExtensionInviteBinding,
  touchExtensionSession,
  updateExtensionUserLogin
} from "@weather-smart-money/data";

import type { Env } from "./env";
import {
  buildErrorMarketAnnotationPayload,
  buildMarketAnnotationPayload,
  ensureSchema,
  refreshMarketAnnotationPayloadSummaries,
  getCacheEnvelopeEtag,
  readLabelsLookupCache,
  readMarketAnnotationCache,
  readStaleMarketAnnotation,
  writeLabelsLookupCache,
  writeMarketAnnotationCache
} from "./data";
import {
  enrichAddressSummariesWithAiHoverNotes,
  type WorkerWaitUntilContext
} from "./hover-note-ai";
import {
  buildJsonResponse,
  generateRandomToken,
  hashValue,
  isoNow,
  parseJson,
  signAccessToken,
  verifyAccessToken
} from "./utils";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_APPROVAL_SECRET_HEADER = "x-admin-approval-secret";
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_KEY_BITS = 256;
const PASSWORD_SALT_BYTES = 16;
const MAX_LOOKUP_ADDRESSES = 500;
const clampSearchLimit = (value: string | null) => {
  const parsed = Number(value ?? "12");
  return Number.isFinite(parsed) ? Math.max(1, Math.min(25, Math.floor(parsed))) : 12;
};
const marketAnnotationInflight = new Map<
  string,
  Promise<{
    etag: string;
    payload: Awaited<ReturnType<typeof buildMarketAnnotationPayload>>;
    cachedAt: string;
  }>
>();

const unauthorized = () => buildJsonResponse({ error: "unauthorized" }, {}, 401);

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const encodeHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

const decodeHex = (value: string) =>
  Uint8Array.from((value.match(/.{1,2}/g) ?? []).map((part) => Number.parseInt(part, 16)));

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
  const passwordSalt = encodeHex(salt.buffer);
  const passwordHash = await derivePasswordHash(password, passwordSalt, PASSWORD_ITERATIONS);
  return {
    passwordHash,
    passwordSalt,
    passwordIterations: PASSWORD_ITERATIONS
  };
};

const escapeHeaderValue = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

const buildPlainTextEmail = (input: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) =>
  [
    `From: ${escapeHeaderValue(input.from)}`,
    `To: ${escapeHeaderValue(input.to)}`,
    `Subject: ${escapeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text.replace(/\r?\n/g, "\r\n")
  ].join("\r\n");

const normalizeEtag = (value?: string | null) => {
  if (!value) {
    return null;
  }

  return value.trim().replace(/^W\//i, "");
};

const etagMatches = (etag: string | null | undefined, ifNoneMatch: string | null) => {
  const normalizedEtag = normalizeEtag(etag);
  if (!normalizedEtag || !ifNoneMatch) {
    return false;
  }

  return ifNoneMatch
    .split(",")
    .map((part) => normalizeEtag(part))
    .filter((part): part is string => Boolean(part))
    .includes(normalizedEtag);
};

const buildMarketHealthShell = (slug: string): NonNullable<ExtensionHealthResponse["market"]> => ({
  requestedSlug: slug,
  marketSlug: slug,
  conditionId: "",
  sourceStatus: "error",
  holderCount: 0,
  matchedSummaryCount: 0
});

const buildRuntimeSnapshot = (
  body: ExtensionHealthRequest,
  now: string
): ExtensionHealthResponse["runtime"] => {
  const hasRuntimeState =
    typeof body.bootstrapState === "string" ||
    typeof body.wakeReason === "string" ||
    typeof body.degradedReason === "string" ||
    typeof body.lastSuccessfulSlug === "string" ||
    typeof body.lastAnnotationSyncAt === "string";

  if (!hasRuntimeState) {
    return undefined;
  }

  return {
    bootstrapState: body.bootstrapState ?? "cold_start",
    wakeReason: body.wakeReason ?? "unknown",
    degradedReason: body.degradedReason,
    lastSuccessfulSlug: typeof body.lastSuccessfulSlug === "string" ? body.lastSuccessfulSlug.trim() || undefined : undefined,
    lastAnnotationSyncAt:
      typeof body.lastAnnotationSyncAt === "string" ? body.lastAnnotationSyncAt.trim() || undefined : undefined,
    updatedAt: now
  };
};

const buildMarketAnnotationEnvelope = async (
  env: Env,
  slug: string,
  labelsVersion: string,
  ctx?: WorkerWaitUntilContext
) => {
  const payload = await buildMarketAnnotationPayload(env, slug, ctx);
  const envelope = {
    etag: await getCacheEnvelopeEtag(payload),
    payload,
    cachedAt: isoNow()
  };

  await writeMarketAnnotationCache(env, slug, labelsVersion, envelope);
  return envelope;
};

const getOrBuildMarketAnnotationEnvelope = async (
  env: Env,
  slug: string,
  labelsVersion: string,
  ctx?: WorkerWaitUntilContext
) => {
  const inflightKey = `${labelsVersion}:${slug}`;
  const existing = marketAnnotationInflight.get(inflightKey);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    try {
      return await buildMarketAnnotationEnvelope(env, slug, labelsVersion, ctx);
    } finally {
      marketAnnotationInflight.delete(inflightKey);
    }
  })();

  marketAnnotationInflight.set(inflightKey, task);
  return task;
};

const isTruthySearchParam = (value: string | null) =>
  Boolean(value && ["1", "true", "yes"].includes(value.trim().toLowerCase()));

const shouldBypassCache = (request: Request, url: URL) => {
  if (isTruthySearchParam(url.searchParams.get("force")) || isTruthySearchParam(url.searchParams.get("refresh"))) {
    return true;
  }

  const cacheControl = request.headers.get("cache-control")?.toLowerCase() ?? "";
  if (cacheControl.includes("no-cache") || cacheControl.includes("no-store") || cacheControl.includes("max-age=0")) {
    return true;
  }

  const pragma = request.headers.get("pragma")?.toLowerCase() ?? "";
  return pragma.includes("no-cache");
};

const buildAuthResponse = async (
  env: Env,
  session: Awaited<ReturnType<typeof createExtensionSession>>
) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + ACCESS_TOKEN_TTL_SECONDS;
  const accessToken = await signAccessToken(env, {
    sid: session.id,
    memberLabel: session.memberLabel,
    iat: issuedAt,
    exp: expiresAtSeconds
  });

  return {
    userId: session.userId ?? undefined,
    userEmail: session.userEmail ?? undefined,
    inviteCode: session.inviteCode,
    accessToken,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    refreshExpiresAt: session.refreshExpiresAt,
    memberLabel: session.memberLabel
  };
};

const parseBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
};

const authenticateRequest = async (request: Request, env: Env) => {
  const token = parseBearerToken(request);
  if (!token) {
    return null;
  }

  const payload = await verifyAccessToken(env, token);
  if (!payload || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const session = await getExtensionSessionById(env.SMART_MONEY_DB, payload.sid);
  if (!session || session.revokedAt) {
    return null;
  }

  if (new Date(session.refreshExpiresAt).getTime() <= Date.now()) {
    await revokeExtensionSession(env.SMART_MONEY_DB, session.id);
    return null;
  }

  await touchExtensionSession(env.SMART_MONEY_DB, session.id);
  return session;
};

const resolveActiveInvite = async (env: Env, inviteCode?: string | null) => {
  const normalizedInviteCode = inviteCode?.trim();
  if (!normalizedInviteCode) {
    return {
      inviteCode: null,
      invite: null
    };
  }

  const invite = await getExtensionInvite(env.SMART_MONEY_DB, normalizedInviteCode);
  if (!invite || invite.status !== "active") {
    throw new Error("invalid invite");
  }

  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    throw new Error("invite expired");
  }

  return {
    inviteCode: normalizedInviteCode,
    invite
  };
};

const issueExtensionSession = async (
  env: Env,
  input: {
    memberLabel: string;
    inviteCode: string;
    userId?: string | null;
    userEmail?: string | null;
    deviceLabel?: string;
    extensionVersion?: string;
  }
) => {
  const refreshToken = generateRandomToken(48);
  const refreshTokenHash = await hashValue(refreshToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  const session = await createExtensionSession(env.SMART_MONEY_DB, {
    refreshTokenHash,
    memberLabel: input.memberLabel,
    inviteCode: input.inviteCode,
    userId: input.userId,
    userEmail: input.userEmail,
    refreshExpiresAt,
    deviceLabel: input.deviceLabel,
    extensionVersion: input.extensionVersion
  });

  await markExtensionInviteUsed(env.SMART_MONEY_DB, input.inviteCode);

  return buildJsonResponse({
    ...(await buildAuthResponse(env, session)),
    refreshToken
  });
};

const authenticateExtensionUserLogin = async (
  env: Env,
  input: {
    email?: string;
    password?: string;
    inviteCode?: string;
    deviceLabel?: string;
    extensionVersion?: string;
    requireInviteForNewUser?: boolean;
  }
) => {
  const normalizedEmail = normalizeEmail(input.email ?? "");
  const password = input.password ?? "";

  if (!normalizedEmail) {
    return buildJsonResponse({ error: "email is required" }, {}, 400);
  }

  if (!password) {
    return buildJsonResponse({ error: "password is required" }, {}, 400);
  }

  let inviteCode: string | null = null;
  let invite: Awaited<ReturnType<typeof getExtensionInvite>> | null = null;
  try {
    const resolved = await resolveActiveInvite(env, input.inviteCode);
    inviteCode = resolved.inviteCode;
    invite = resolved.invite;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid invite";
    return buildJsonResponse({ error: message }, {}, message === "invite expired" ? 401 : 401);
  }
  const existingUser = await getExtensionUserByNormalizedEmail(env.SMART_MONEY_DB, normalizedEmail);

  if (!existingUser) {
    if (input.requireInviteForNewUser !== false && !inviteCode) {
      return buildJsonResponse({ error: "inviteCode is required for first sign-in" }, {}, 400);
    }

    if (!invite || !inviteCode) {
      return buildJsonResponse({ error: "invalid invite" }, {}, 401);
    }

    if (invite.boundUserId || invite.boundUserEmail) {
      return buildJsonResponse({ error: "invite already bound to another user" }, {}, 409);
    }

    if (password.length < 8) {
      return buildJsonResponse({ error: "password must be at least 8 characters" }, {}, 400);
    }

    const passwordRecord = await createPasswordRecord(password);
    const user = await createExtensionUser(env.SMART_MONEY_DB, {
      email: normalizedEmail,
      normalizedEmail,
      passwordHash: passwordRecord.passwordHash,
      passwordSalt: passwordRecord.passwordSalt,
      passwordIterations: passwordRecord.passwordIterations,
      inviteCode,
      memberLabel: invite.memberLabel
    });
    await setExtensionInviteBinding(env.SMART_MONEY_DB, inviteCode, {
      userId: user.id,
      userEmail: user.email,
      boundAt: user.boundAt ?? isoNow()
    });

    return issueExtensionSession(env, {
      memberLabel: invite.memberLabel,
      inviteCode,
      userId: user.id,
      userEmail: user.email,
      deviceLabel: input.deviceLabel,
      extensionVersion: input.extensionVersion
    });
  }

  if (existingUser.disabledAt) {
    return buildJsonResponse({ error: "user disabled" }, {}, 403);
  }

  const passwordHash = await derivePasswordHash(
    password,
    existingUser.passwordSalt,
    existingUser.passwordIterations
  );
  if (passwordHash !== existingUser.passwordHash) {
    return buildJsonResponse({ error: "invalid email or password" }, {}, 401);
  }

  let resolvedInviteCode = existingUser.inviteCode ?? null;
  let resolvedMemberLabel = existingUser.memberLabel ?? null;

  if (!resolvedInviteCode) {
    if (!invite || !inviteCode) {
      return buildJsonResponse({ error: "inviteCode is required to bind this account" }, {}, 400);
    }

    if (invite.boundUserId && invite.boundUserId !== existingUser.id) {
      return buildJsonResponse({ error: "invite already bound to another user" }, {}, 409);
    }

    const boundUser = await bindExtensionUserInvite(env.SMART_MONEY_DB, existingUser.id, {
      inviteCode,
      memberLabel: invite.memberLabel
    });
    await setExtensionInviteBinding(env.SMART_MONEY_DB, inviteCode, {
      userId: existingUser.id,
      userEmail: existingUser.email,
      boundAt: boundUser?.boundAt ?? isoNow()
    });
    resolvedInviteCode = inviteCode;
    resolvedMemberLabel = invite.memberLabel;
  } else if (inviteCode && inviteCode !== resolvedInviteCode) {
    return buildJsonResponse({ error: "this account is already bound to another invite" }, {}, 409);
  }

  await updateExtensionUserLogin(env.SMART_MONEY_DB, existingUser.id);

  if (!resolvedInviteCode) {
    return buildJsonResponse(
      { error: "account is not bound to an invite, please sign in with an invite code once" },
      {},
      409
    );
  }

  return issueExtensionSession(env, {
    memberLabel: resolvedMemberLabel ?? existingUser.memberLabel ?? existingUser.email,
    inviteCode: resolvedInviteCode,
    userId: existingUser.id,
    userEmail: existingUser.email,
    deviceLabel: input.deviceLabel,
    extensionVersion: input.extensionVersion
  });
};

export const handleAuthExchange = async (request: Request, env: Env) => {
  await ensureSchema(env);
  const body = await parseJson<{
    inviteCode?: string;
    deviceLabel?: string;
    extensionVersion?: string;
  }>(request);
  const inviteCode = body.inviteCode?.trim();

  if (!inviteCode) {
    return buildJsonResponse({ error: "inviteCode is required" }, {}, 400);
  }

  let invite: Awaited<ReturnType<typeof getExtensionInvite>> | null = null;
  try {
    invite = (await resolveActiveInvite(env, inviteCode)).invite;
  } catch (error) {
    return buildJsonResponse(
      { error: error instanceof Error ? error.message : "invalid invite" },
      {},
      401
    );
  }
  if (!invite) {
    return buildJsonResponse({ error: "invalid invite" }, {}, 401);
  }
  if (invite.boundUserId || invite.boundUserEmail) {
    return buildJsonResponse(
      { error: "invite is already bound to a user account, please update the extension and sign in with email" },
      {},
      409
    );
  }

  return issueExtensionSession(env, {
    memberLabel: invite.memberLabel,
    inviteCode,
    deviceLabel: body.deviceLabel,
    extensionVersion: body.extensionVersion
  });
};

export const handleAuthLogin = async (request: Request, env: Env) => {
  await ensureSchema(env);
  const body = await parseJson<{
    email?: string;
    password?: string;
    inviteCode?: string;
    deviceLabel?: string;
    extensionVersion?: string;
  }>(request);

  return authenticateExtensionUserLogin(env, {
    email: body.email,
    password: body.password,
    inviteCode: body.inviteCode,
    deviceLabel: body.deviceLabel,
    extensionVersion: body.extensionVersion,
    requireInviteForNewUser: false
  });
};

export const handleAuthRegister = async (request: Request, env: Env) => {
  await ensureSchema(env);
  const body = await parseJson<{
    email?: string;
    password?: string;
    inviteCode?: string;
    deviceLabel?: string;
    extensionVersion?: string;
  }>(request);

  return authenticateExtensionUserLogin(env, {
    email: body.email,
    password: body.password,
    inviteCode: body.inviteCode,
    deviceLabel: body.deviceLabel,
    extensionVersion: body.extensionVersion,
    requireInviteForNewUser: true
  });
};

export const handleAuthRefresh = async (request: Request, env: Env) => {
  await ensureSchema(env);
  const body = await parseJson<{ refreshToken?: string }>(request);
  const refreshToken = body.refreshToken?.trim();

  if (!refreshToken) {
    return buildJsonResponse({ error: "refreshToken is required" }, {}, 400);
  }

  const refreshTokenHash = await hashValue(refreshToken);
  const currentSession = await getExtensionSessionByRefreshHash(env.SMART_MONEY_DB, refreshTokenHash);
  if (!currentSession || currentSession.revokedAt) {
    return buildJsonResponse({ error: "invalid refresh token" }, {}, 401);
  }

  if (new Date(currentSession.refreshExpiresAt).getTime() <= Date.now()) {
    await revokeExtensionSession(env.SMART_MONEY_DB, currentSession.id);
    return buildJsonResponse({ error: "refresh token expired" }, {}, 401);
  }

  await revokeExtensionSession(env.SMART_MONEY_DB, currentSession.id);

  const refreshTokenNext = generateRandomToken(48);
  const nextRefreshHash = await hashValue(refreshTokenNext);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  const nextSession = await createExtensionSession(env.SMART_MONEY_DB, {
    refreshTokenHash: nextRefreshHash,
    memberLabel: currentSession.memberLabel,
    inviteCode: currentSession.inviteCode,
    userId: currentSession.userId,
    userEmail: currentSession.userEmail,
    refreshExpiresAt,
    deviceLabel: currentSession.deviceLabel ?? undefined,
    extensionVersion: currentSession.extensionVersion ?? undefined
  });

  return buildJsonResponse({
    ...(await buildAuthResponse(env, nextSession)),
    refreshToken: refreshTokenNext
  });
};

export const handleAuthLogout = async (request: Request, env: Env) => {
  await ensureSchema(env);
  const body = await parseJson<{ refreshToken?: string }>(request);
  const refreshToken = body.refreshToken?.trim();

  if (refreshToken) {
    const refreshTokenHash = await hashValue(refreshToken);
    const session = await getExtensionSessionByRefreshHash(env.SMART_MONEY_DB, refreshTokenHash);
    if (session) {
      await revokeExtensionSession(env.SMART_MONEY_DB, session.id);
    }
  }

  return new Response(null, { status: 204 });
};

export const handleAdminApprovalEmail = async (request: Request, env: Env) => {
  if (request.method !== "POST") {
    return buildJsonResponse({ error: "method not allowed" }, {}, 405);
  }

  const providedSecret = request.headers.get(ADMIN_APPROVAL_SECRET_HEADER)?.trim();
  if (!providedSecret || providedSecret !== env.ADMIN_APPROVAL_SHARED_SECRET.trim()) {
    return buildJsonResponse({ error: "forbidden" }, {}, 403);
  }

  const body = await parseJson<{
    requestEmail?: string;
    approvalCode?: string;
    requestedAt?: string;
    requestedIp?: string | null;
    accessEmail?: string;
    ttlMinutes?: number;
  }>(request);

  const requestEmail = body.requestEmail?.trim().toLowerCase();
  const approvalCode = body.approvalCode?.trim();
  const requestedAt = body.requestedAt?.trim();
  const ttlMinutes =
    typeof body.ttlMinutes === "number" && Number.isFinite(body.ttlMinutes) && body.ttlMinutes > 0
      ? Math.round(body.ttlMinutes)
      : 10;

  if (!requestEmail || !approvalCode || !requestedAt) {
    return buildJsonResponse({ error: "missing approval email payload" }, {}, 400);
  }

  const senderEmail = env.ADMIN_APPROVAL_SENDER_EMAIL.trim().toLowerCase();
  const senderName = env.ADMIN_APPROVAL_SENDER_NAME?.trim() || "Smart Money Admin";
  const ownerEmail = env.ADMIN_APPROVAL_OWNER_EMAIL.trim().toLowerCase();
  const raw = buildPlainTextEmail({
    from: `${senderName} <${senderEmail}>`,
    to: ownerEmail,
    subject: `Smart Money admin approval code ${approvalCode}`,
    text: [
      "A new admin registration request is waiting for your approval.",
      "",
      `Requested account email: ${requestEmail}`,
      `Approval code: ${approvalCode}`,
      `Requested at: ${requestedAt}`,
      `Expires in: ${ttlMinutes} minutes`,
      `Request IP: ${body.requestedIp?.trim() || "unknown"}`,
      `Access email: ${body.accessEmail?.trim() || "not provided"}`,
      "",
      "Only forward this code if you approve the registration."
    ].join("\n")
  });

  const message = new EmailMessage(senderEmail, ownerEmail, raw);
  await env.ADMIN_APPROVAL_EMAIL.send(message);

  return buildJsonResponse({ ok: true });
};

/**
 * 城市真实战绩（扩展端 Polymarket 城市市场页用）。
 *
 * 胜率口径：已结算仓位 won/resolved，来自 Finder 的城市层级战绩；
 * 样本 < 5 个已结算仓位时后端不给百分比，只给 confidence=insufficient，
 * 让扩展端显示「样本不足」而不是把 2/2 的 100% 当战绩。
 *
 * 城市解析不出或库里没这个城市时返回 `{data: null}` + 200：
 * 「我们没这个城市的数据」不是错误，扩展端据此静默跳过城市战绩模块。
 */
export const handleCityWinRate = async (request: Request, env: Env) => {
  await ensureSchema(env);
  const session = await authenticateRequest(request, env);
  if (!session) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim() || null;
  const city = url.searchParams.get("city")?.trim() || null;

  if (!slug && !city) {
    return buildJsonResponse({ error: "slug or city is required" }, {}, 400);
  }

  try {
    const payload = await getCityWinRatePayload(env.SMART_MONEY_DB, { slug, city });
    // 城市战绩随 Finder run 批量更新，30s 缓存足够；扩展端本身还有 5 分钟本地
    // 缓存，这里只是让浏览器/CDN 层别反复回源，不再另建 KV 缓存信封——
    // D1 上的 json_each 聚合本来就比读 KV 重，多一层缓存反而难失效。
    return buildJsonResponse(
      { data: payload },
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (error) {
    return buildJsonResponse(
      {
        error: "city_win_rate_failed",
        message: error instanceof Error ? error.message : String(error)
      },
      {},
      500
    );
  }
};

export const handleMarketAnnotations = async (request: Request, env: Env, ctx: WorkerWaitUntilContext) => {
  await ensureSchema(env);
  const session = await authenticateRequest(request, env);
  if (!session) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return buildJsonResponse({ error: "slug is required" }, {}, 400);
  }

  const labelsVersion = `v${await getDatasetVersion(env.SMART_MONEY_DB, "address_labels")}`;
  const ifNoneMatch = request.headers.get("if-none-match");
  const bypassCache = shouldBypassCache(request, url);
  const cached = bypassCache ? null : await readMarketAnnotationCache(env, slug, labelsVersion);

  // stale 的缓存（标签刚更新、或超过新鲜期）依然直接返回，并后台重建。
  // 用户总能立刻看到内容，而不是等一次 Polymarket 往返；下一次请求就是新的。
  // 关键点：返回旧数据不等于放弃刷新，重建必须真的发出去，
  // 否则 stale 会一直 stale，标签更新永远推不到扩展端。
  if (cached?.stale) {
    ctx.waitUntil(
      getOrBuildMarketAnnotationEnvelope(env, slug, labelsVersion, ctx).catch((error: unknown) => {
        console.warn("stale annotation background refresh failed", {
          slug,
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  }

  if (cached && etagMatches(cached.envelope.etag, ifNoneMatch)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: cached.envelope.etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  }

  if (cached) {
    return buildJsonResponse(
      cached.envelope.payload,
      {
        headers: {
          ETag: cached.envelope.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  }

  try {
    const envelope = await getOrBuildMarketAnnotationEnvelope(env, slug, labelsVersion, ctx);

    if (etagMatches(envelope.etag, ifNoneMatch)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: envelope.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      });
    }

    return buildJsonResponse(
      envelope.payload,
      {
        headers: {
          ETag: envelope.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  } catch (error) {
    const debugError = error instanceof Error ? error.message : String(error);
    console.error("market-annotations build failed", {
      slug,
      error: debugError
    });
    const stale = await readStaleMarketAnnotation(env, slug);
    if (stale) {
      const payload = await refreshMarketAnnotationPayloadSummaries(
        env,
        stale.payload,
        {
          labelsVersion,
          refreshedAt: isoNow(),
          sourceStatus: "stale"
        },
        ctx
      );
      const etag = await getCacheEnvelopeEtag(payload);

      if (etagMatches(etag, ifNoneMatch)) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            "Cache-Control": "private, max-age=0, must-revalidate"
          }
        });
      }

      return buildJsonResponse(
        payload,
        {
          headers: {
            ETag: etag,
            "Cache-Control": "private, max-age=0, must-revalidate"
          }
        },
        200
      );
    }

    const payload = await buildErrorMarketAnnotationPayload(env, slug);
    const etag = await getCacheEnvelopeEtag(payload);

    return buildJsonResponse(
      payload,
      {
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  }
};

export const handleLabelsLookup = async (request: Request, env: Env, ctx: WorkerWaitUntilContext) => {
  await ensureSchema(env);
  const session = await authenticateRequest(request, env);
  if (!session) {
    return unauthorized();
  }

  const body = await parseJson<{ chain?: "polygon"; addresses?: string[] }>(request);
  const chain = body.chain ?? "polygon";

  if (!Array.isArray(body.addresses) || body.addresses.length === 0) {
    return buildJsonResponse({ error: "addresses is required" }, {}, 400);
  }

  if (body.addresses.length > MAX_LOOKUP_ADDRESSES) {
    return buildJsonResponse(
      { error: `addresses cannot exceed ${MAX_LOOKUP_ADDRESSES} per request` },
      {},
      413
    );
  }

  const normalizedAddresses = Array.from(
    new Set(
      body.addresses
        .map((value) => (typeof value === "string" ? normalizeAddress(value) : null))
        .filter((value): value is NormalizedAddress => Boolean(value))
    )
  );

  if (normalizedAddresses.length === 0) {
    return buildJsonResponse({ error: "no normalized addresses found" }, {}, 400);
  }

  const version = `v${await getDatasetVersion(env.SMART_MONEY_DB, "address_labels")}`;
  const lookupHash = await hashValue(normalizedAddresses.join(","));
  // key 里不放 labels 版本：版本作为字段比对，改标签时 UPSERT 同一行。
  // 放进 key 会让每次改标签都换一批新 key，旧行永远读不到，只增不减。
  const cacheKey = `labels-lookup:${lookupHash}`;
  const ifNoneMatch = request.headers.get("if-none-match");
  const cached = await readLabelsLookupCache<{ items: Awaited<ReturnType<typeof listAddressSummaries>>; version: string }>(
    env,
    cacheKey,
    version
  );

  if (cached && etagMatches(cached.envelope.etag, ifNoneMatch)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: cached.envelope.etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  }

  if (cached) {
    return buildJsonResponse(
      cached.envelope.payload,
      {
        headers: {
          ETag: cached.envelope.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  }

  const items = await enrichAddressSummariesWithAiHoverNotes(
    env,
    await listAddressSummaries(env.SMART_MONEY_DB, {
      chain,
      normalizedAddresses,
      adminBaseUrl: env.ADMIN_BASE_URL
    }),
    {
      executionContext: ctx,
      backgroundOnMiss: true
    }
  );
  const payload = { items, version };
  const etag = await getCacheEnvelopeEtag(payload);

  await writeLabelsLookupCache(env, cacheKey, version, {
    etag,
    payload,
    cachedAt: isoNow()
  });

  return buildJsonResponse(
    payload,
    {
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    },
    200
  );
};

export const handleAddressSearch = async (request: Request, env: Env, ctx: WorkerWaitUntilContext) => {
  await ensureSchema(env);
  const session = await authenticateRequest(request, env);
  if (!session) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = clampSearchLimit(url.searchParams.get("limit"));

  if (!query) {
    return buildJsonResponse({ items: [] satisfies AddressSearchResult[], version: "v0" });
  }

  if (query.length > 160) {
    return buildJsonResponse({ error: "q is too long" }, {}, 400);
  }

  const version = `v${await getDatasetVersion(env.SMART_MONEY_DB, "address_labels")}`;
  const cacheKey = `address-search:${await hashValue(`${query.toLowerCase()}:${limit}`)}`;
  const ifNoneMatch = request.headers.get("if-none-match");
  const cached = await readLabelsLookupCache<{ items: AddressSearchResult[]; version: string }>(
    env,
    cacheKey,
    version
  );

  if (cached && etagMatches(cached.envelope.etag, ifNoneMatch)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: cached.envelope.etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  }

  if (cached) {
    return buildJsonResponse(
      cached.envelope.payload,
      {
        headers: {
          ETag: cached.envelope.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  }

  const items = await enrichAddressSummariesWithAiHoverNotes(
    env,
    await searchAddressSummaries(env.SMART_MONEY_DB, {
      query,
      limit,
      adminBaseUrl: env.ADMIN_BASE_URL
    }),
    {
      executionContext: ctx,
      backgroundOnMiss: true
    }
  );
  const payload = { items, version };
  const etag = await getCacheEnvelopeEtag(payload);

  await writeLabelsLookupCache(env, cacheKey, version, {
    etag,
    payload,
    cachedAt: isoNow()
  });

  return buildJsonResponse(
    payload,
    {
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    },
    200
  );
};

export const handleExtensionHealth = async (request: Request, env: Env, ctx: WorkerWaitUntilContext) => {
  await ensureSchema(env);
  const session = await authenticateRequest(request, env);
  if (!session) {
    return unauthorized();
  }

  if (request.method !== "POST") {
    return buildJsonResponse({ error: "method not allowed" }, {}, 405);
  }

  const body = await parseJson<Record<string, unknown> & ExtensionHealthRequest>(request);
  const labelsVersion = `v${await getDatasetVersion(env.SMART_MONEY_DB, "address_labels")}`;
  const now = isoNow();
  const errors: string[] = [];
  const response: ExtensionHealthResponse = {
    ok: true,
    now,
    labelsVersion,
    runtime: buildRuntimeSnapshot(body, now),
    auth: {
      memberLabel: session.memberLabel,
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
      extensionVersion: session.extensionVersion,
      refreshExpiresAt: session.refreshExpiresAt
    }
  };

  let normalizedAddresses = Array.isArray(body.addresses)
    ? Array.from(
        new Set(
          body.addresses
            .map((value) => (typeof value === "string" ? normalizeAddress(value) : null))
            .filter((value): value is NormalizedAddress => Boolean(value))
        )
      )
    : [];

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (slug) {
    try {
      // health 接口以前直接 getOrBuild，完全不读缓存 —— 而扩展每次渲染、每次
      // panel_missing / slug_missing 都会打一次 health，等于每次都是一次强制重建
      // 加两次缓存写入。扩展侧本来就有 45s/90s 的本地缓存，health 只是探活，
      // 不需要每次都重新构建一份。
      // 先读缓存：命中就直接用，只有真正缺失才重建。
      const cached = await readMarketAnnotationCache(env, slug, labelsVersion);
      if (cached?.stale) {
        ctx.waitUntil(
          getOrBuildMarketAnnotationEnvelope(env, slug, labelsVersion, ctx).catch((error: unknown) => {
            console.warn("health stale annotation refresh failed", {
              slug,
              error: error instanceof Error ? error.message : String(error)
            });
          })
        );
      }
      const payload =
        cached?.envelope.payload ??
        (await getOrBuildMarketAnnotationEnvelope(env, slug, labelsVersion, ctx)).payload;
      response.market = {
        ...buildMarketHealthShell(slug),
        marketSlug: payload.market.slug,
        conditionId: payload.market.conditionId,
        sourceStatus: payload.sourceStatus,
        resolvedBy: payload.resolvedBy,
        holderCount: payload.holders.length,
        matchedSummaryCount: payload.matchedSummaryCount ?? 0,
        holderSurfaceHints: payload.holderSurfaceHints
      };

      if (response.runtime) {
        response.runtime = {
          ...response.runtime,
          lastSuccessfulSlug: response.runtime.lastSuccessfulSlug ?? payload.market.slug,
          lastAnnotationSyncAt: response.runtime.lastAnnotationSyncAt ?? response.now,
          updatedAt: response.now
        };
      }

      if (normalizedAddresses.length === 0) {
        normalizedAddresses = payload.holders.map((holder) => holder.normalizedAddress);
      }
    } catch (error) {
      errors.push(`market:${error instanceof Error ? error.message : String(error)}`);
      response.market = {
        ...buildMarketHealthShell(slug),
        resolvedBy: "error"
      };
    }
  }

  if (normalizedAddresses.length > 0) {
    try {
      const items = await listAddressSummaries(env.SMART_MONEY_DB, {
        chain: "polygon",
        normalizedAddresses,
        adminBaseUrl: env.ADMIN_BASE_URL
      });
      response.lookup = {
        requestedCount: normalizedAddresses.length,
        matchedCount: items.length,
        version: labelsVersion
      };
    } catch (error) {
      errors.push(`lookup:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length > 0) {
    response.ok = false;
    response.errors = errors;
  }

  return buildJsonResponse(response);
};
