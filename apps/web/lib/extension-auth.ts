import crypto from "node:crypto";
import {
  ExtensionAuthExchangeRequest,
  ExtensionAuthExchangeResponse,
  ExtensionAuthRefreshRequest,
  ExtensionAuthLogoutRequest,
  ExtensionAuthSession
} from "@weather-smart-money/core";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1_000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const INVITE_CODES_ENV = process.env.EXTENSION_INVITE_CODES?.trim();
const ENV_READONLY_TOKEN = process.env.EXTENSION_READ_ONLY_TOKEN?.trim();

const invitesByCode = new Map<string, string>();
const sessionsByAccess = new Map<string, ExtensionAuthSession>();
const sessionsByRefresh = new Map<string, ExtensionAuthSession>();

const randomToken = (bytes: number) => crypto.randomBytes(bytes).toString("hex");

const parseInviteConfig = () => {
  if (invitesByCode.size) {
    return;
  }

  if (!INVITE_CODES_ENV) {
    invitesByCode.set("demo-team", "Team Alpha");
    return;
  }

  INVITE_CODES_ENV.split(/[;,]/).forEach((segment) => {
    const [codePart, labelPart] = segment.split(":").map((item) => item.trim());
    if (!codePart) {
      return;
    }

    invitesByCode.set(codePart, labelPart || `Member ${codePart}`);
  });
};

const inviteMemberLabel = (code: string) => {
  parseInviteConfig();
  return invitesByCode.get(code.trim());
};

const createSession = ({
  inviteCode,
  memberLabel,
  deviceLabel,
  extensionVersion
}: Pick<ExtensionAuthSession, "inviteCode" | "memberLabel" | "deviceLabel" | "extensionVersion">) => {
  const now = Date.now();
  const accessToken = randomToken(16);
  const refreshToken = randomToken(24);
  const expiresAt = new Date(now + ACCESS_TOKEN_TTL_MS).toISOString();
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL_MS).toISOString();

  const session: ExtensionAuthSession = {
    memberLabel,
    inviteCode,
    deviceLabel,
    extensionVersion,
    accessToken,
    refreshToken,
    expiresAt,
    refreshExpiresAt
  };

  sessionsByAccess.set(accessToken, session);
  sessionsByRefresh.set(refreshToken, session);
  return session;
};

const destroySession = (session: ExtensionAuthSession) => {
  sessionsByAccess.delete(session.accessToken);
  sessionsByRefresh.delete(session.refreshToken);
};

const rotateSession = (session: ExtensionAuthSession) => {
  destroySession(session);
  return createSession({
    inviteCode: session.inviteCode,
    memberLabel: session.memberLabel,
    deviceLabel: session.deviceLabel,
    extensionVersion: session.extensionVersion
  });
};

const isExpired = (timestamp: string) => Date.now() > new Date(timestamp).getTime();

const sessionToResponse = (session: ExtensionAuthSession): ExtensionAuthExchangeResponse => ({
  accessToken: session.accessToken,
  refreshToken: session.refreshToken,
  expiresAt: session.expiresAt,
  refreshExpiresAt: session.refreshExpiresAt,
  memberLabel: session.memberLabel
});

const parseBearerToken = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return trimmed.slice(7).trim();
};

const validateAccessToken = (token: string): ExtensionAuthSession | null => {
  const session = sessionsByAccess.get(token);
  if (!session) {
    return null;
  }

  if (isExpired(session.expiresAt)) {
    destroySession(session);
    return null;
  }

  return session;
};

export const isExtensionReadOnlyRequestAuthorized = (request: Request) => {
  if (ENV_READONLY_TOKEN && request.headers.get("authorization")?.trim() === `Bearer ${ENV_READONLY_TOKEN}`) {
    return true;
  }

  const accessToken = parseBearerToken(request.headers.get("authorization"));
  return Boolean(accessToken && validateAccessToken(accessToken));
};

export const createSessionFromInvite = (
  payload: ExtensionAuthExchangeRequest
): ExtensionAuthExchangeResponse => {
  const memberLabel = inviteMemberLabel(payload.inviteCode);
  if (!memberLabel) {
    throw new Error("Invalid invite code");
  }

  const session = createSession({
    inviteCode: payload.inviteCode.trim(),
    memberLabel,
    deviceLabel: payload.deviceLabel?.trim(),
    extensionVersion: payload.extensionVersion?.trim()
  });

  return sessionToResponse(session);
};

export const refreshSession = (
  payload: ExtensionAuthRefreshRequest
): ExtensionAuthExchangeResponse | null => {
  const session = sessionsByRefresh.get(payload.refreshToken);
  if (!session) {
    return null;
  }

  if (isExpired(session.refreshExpiresAt)) {
    destroySession(session);
    return null;
  }

  const rotated = rotateSession(session);
  return sessionToResponse(rotated);
};

export const logoutSession = (payload: ExtensionAuthLogoutRequest) => {
  const session = sessionsByRefresh.get(payload.refreshToken);
  if (!session) {
    return false;
  }

  destroySession(session);
  return true;
};
