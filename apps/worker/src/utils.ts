import type { Env } from "./env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface AccessTokenPayload {
  sid: string;
  memberLabel: string;
  exp: number;
  iat: number;
  iss: string;
}

const normalizeSecret = (secret: string) => encoder.encode(secret.trim());

const encodeBase64Url = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return decoder.decode(bytes);
};

const decodeBase64UrlBytes = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const importHmacKey = async (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    normalizeSecret(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

export const isoNow = () => new Date().toISOString();

export const hashValue = async (value: string) => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const generateRandomToken = (size = 32) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const buildJsonResponse = (
  payload: unknown,
  init: ResponseInit = {},
  status = 200
) =>
  new Response(JSON.stringify(payload), {
    status,
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

export const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,If-None-Match");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

export const parseJson = async <T extends Record<string, unknown>>(request: Request) => {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
};

export const signAccessToken = async (
  env: Env,
  payload: Omit<AccessTokenPayload, "iss"> & { iss?: string }
) => {
  const header = { alg: "HS256", typ: "JWT" };
  const body: AccessTokenPayload = {
    ...payload,
    iss: payload.iss ?? env.PUBLIC_EXTENSION_BASE_URL
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importHmacKey(env.EXTENSION_TOKEN_SECRET);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const signature = encodeBase64Url(new Uint8Array(signatureBuffer));
  return `${signingInput}.${signature}`;
};

export const verifyAccessToken = async (env: Env, token: string) => {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importHmacKey(env.EXTENSION_TOKEN_SECRET);
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64UrlBytes(signature),
    encoder.encode(signingInput)
  ).catch(() => false);

  if (!verified) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<AccessTokenPayload>;
    if (
      typeof payload.sid !== "string" ||
      typeof payload.memberLabel !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }

    return {
      sid: payload.sid,
      memberLabel: payload.memberLabel,
      exp: payload.exp,
      iat: payload.iat,
      iss: typeof payload.iss === "string" ? payload.iss : env.PUBLIC_EXTENSION_BASE_URL
    } satisfies AccessTokenPayload;
  } catch {
    return null;
  }
};
