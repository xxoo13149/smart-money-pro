import { EmailMessage } from "cloudflare:email";
import {
  normalizeAddress,
  type ExtensionHealthRequest,
  type ExtensionHealthResponse,
  type AddressSearchResult,
  type NormalizedAddress
} from "@weather-smart-money/core";
import {
  createExtensionSession,
  getDatasetVersion,
  getExtensionInvite,
  getExtensionSessionById,
  getExtensionSessionByRefreshHash,
  listAddressSummaries,
  markExtensionInviteUsed,
  revokeExtensionSession,
  searchAddressSummaries,
  touchExtensionSession
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
const marketAnnotationInflight = new Map<
  string,
  Promise<{
    etag: string;
    payload: Awaited<ReturnType<typeof buildMarketAnnotationPayload>>;
    cachedAt: string;
  }>
>();

const unauthorized = () => buildJsonResponse({ error: "unauthorized" }, {}, 401);

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

const buildMarketAnnotationEnvelope = async (env: Env, slug: string, labelsVersion: string) => {
  const payload = await buildMarketAnnotationPayload(env, slug);
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
  labelsVersion: string
) => {
  const inflightKey = `${labelsVersion}:${slug}`;
  const existing = marketAnnotationInflight.get(inflightKey);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    try {
      return await buildMarketAnnotationEnvelope(env, slug, labelsVersion);
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

  const invite = await getExtensionInvite(env.SMART_MONEY_DB, inviteCode);
  if (!invite || invite.status !== "active") {
    return buildJsonResponse({ error: "invalid invite" }, {}, 401);
  }

  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    return buildJsonResponse({ error: "invite expired" }, {}, 401);
  }

  const refreshToken = generateRandomToken(48);
  const refreshTokenHash = await hashValue(refreshToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  const session = await createExtensionSession(env.SMART_MONEY_DB, {
    refreshTokenHash,
    memberLabel: invite.memberLabel,
    inviteCode,
    refreshExpiresAt,
    deviceLabel: body.deviceLabel,
    extensionVersion: body.extensionVersion
  });
  await markExtensionInviteUsed(env.SMART_MONEY_DB, inviteCode);

  return buildJsonResponse({
    ...(await buildAuthResponse(env, session)),
    refreshToken
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

export const handleMarketAnnotations = async (request: Request, env: Env) => {
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

  if (cached && etagMatches(cached.etag, ifNoneMatch)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: cached.etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  }

  if (cached) {
    return buildJsonResponse(
      cached.payload,
      {
        headers: {
          ETag: cached.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  }

  try {
    const envelope = await getOrBuildMarketAnnotationEnvelope(env, slug, labelsVersion);

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
      const payload = await refreshMarketAnnotationPayloadSummaries(env, stale.payload, {
        labelsVersion,
        refreshedAt: isoNow(),
        sourceStatus: "stale"
      });
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

export const handleLabelsLookup = async (request: Request, env: Env) => {
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
  const cacheKey = `labels-lookup:${version}:${lookupHash}`;
  const ifNoneMatch = request.headers.get("if-none-match");
  const cached = await readLabelsLookupCache<{ items: Awaited<ReturnType<typeof listAddressSummaries>>; version: string }>(
    env,
    cacheKey
  );

  if (cached && etagMatches(cached.etag, ifNoneMatch)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: cached.etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  }

  if (cached) {
    return buildJsonResponse(
      cached.payload,
      {
        headers: {
          ETag: cached.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  }

  const items = await listAddressSummaries(env.SMART_MONEY_DB, {
    chain,
    normalizedAddresses,
    adminBaseUrl: env.ADMIN_BASE_URL
  });
  const payload = { items, version };
  const etag = await getCacheEnvelopeEtag(payload);

  await writeLabelsLookupCache(env, cacheKey, {
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

export const handleAddressSearch = async (request: Request, env: Env) => {
  await ensureSchema(env);
  const session = await authenticateRequest(request, env);
  if (!session) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "12");

  if (!query) {
    return buildJsonResponse({ items: [] satisfies AddressSearchResult[], version: "v0" });
  }

  const version = `v${await getDatasetVersion(env.SMART_MONEY_DB, "address_labels")}`;
  const cacheKey = `address-search:${version}:${await hashValue(`${query.toLowerCase()}:${limit}`)}`;
  const ifNoneMatch = request.headers.get("if-none-match");
  const cached = await readLabelsLookupCache<{ items: AddressSearchResult[]; version: string }>(
    env,
    cacheKey
  );

  if (cached && etagMatches(cached.etag, ifNoneMatch)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: cached.etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  }

  if (cached) {
    return buildJsonResponse(
      cached.payload,
      {
        headers: {
          ETag: cached.etag,
          "Cache-Control": "private, max-age=0, must-revalidate"
        }
      },
      200
    );
  }

  const items = await searchAddressSummaries(env.SMART_MONEY_DB, {
    query,
    limit,
    adminBaseUrl: env.ADMIN_BASE_URL
  });
  const payload = { items, version };
  const etag = await getCacheEnvelopeEtag(payload);

  await writeLabelsLookupCache(env, cacheKey, {
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

export const handleExtensionHealth = async (request: Request, env: Env) => {
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
      const payload = (await getOrBuildMarketAnnotationEnvelope(env, slug, labelsVersion)).payload;
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
