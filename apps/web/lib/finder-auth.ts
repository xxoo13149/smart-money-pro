import { NextResponse } from "next/server";

import { requireAdminApiSession, type AdminSessionContext } from "./admin-auth";
import { getSmartMoneyBindings } from "./cloudflare-env";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:41873",
  "http://127.0.0.1:41873",
  "http://localhost:41874",
  "http://127.0.0.1:41874"
];

const normalizeToken = (value?: string | null) => value?.trim() || "";

const parseBearerToken = (value?: string | null) => {
  const normalized = normalizeToken(value);
  if (!normalized.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return normalized.slice(7).trim();
};

const splitOrigins = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const getFinderAllowedOrigins = async () => {
  const bindings = await getSmartMoneyBindings();
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...splitOrigins(bindings?.FINDER_ALLOWED_ORIGINS),
    ...splitOrigins(process.env.FINDER_ALLOWED_ORIGINS)
  ]);
};

export const withFinderCors = async (request: Request, response: NextResponse) => {
  const origin = request.headers.get("origin")?.trim();
  if (origin && (await getFinderAllowedOrigins()).has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "false");
  }

  response.headers.set("Vary", "Origin");
  return response;
};

export const finderOptionsResponse = async (request: Request) =>
  withFinderCors(
    request,
    new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Finder-Sync-Token",
        "Access-Control-Max-Age": "600"
      }
    })
  );

const isLocalFinderOrigin = async (request: Request) => {
  const origin = request.headers.get("origin")?.trim();
  return Boolean(origin && (await getFinderAllowedOrigins()).has(origin));
};

const getConfiguredFinderToken = async () => {
  const bindings = await getSmartMoneyBindings();
  return normalizeToken(bindings?.FINDER_SYNC_TOKEN) || normalizeToken(process.env.FINDER_SYNC_TOKEN);
};

export const requireFinderIntegrationRequest = async (
  request: Request
): Promise<
  | {
      ok: true;
      actor: string;
      session?: AdminSessionContext;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> => {
  const expectedToken = await getConfiguredFinderToken();
  const suppliedToken =
    parseBearerToken(request.headers.get("authorization")) ||
    normalizeToken(request.headers.get("x-finder-sync-token"));

  if (expectedToken && suppliedToken && suppliedToken === expectedToken) {
    return {
      ok: true,
      actor: "Finder-app"
    };
  }

  const adminAuth = await requireAdminApiSession(request);
  if (adminAuth.ok) {
    return {
      ok: true,
      actor: adminAuth.session.user.email,
      session: adminAuth.session
    };
  }

  if (!expectedToken && process.env.NODE_ENV !== "production" && (await isLocalFinderOrigin(request))) {
    return {
      ok: true,
      actor: "Finder-app local"
    };
  }

  return {
    ok: false,
    response: await withFinderCors(request, adminAuth.response)
  };
};
