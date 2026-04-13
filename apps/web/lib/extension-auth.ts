import crypto from "node:crypto";
import {
  ExtensionAuthExchangeRequest,
  ExtensionAuthExchangeResponse,
  ExtensionAuthLoginRequest,
  ExtensionAuthLogoutRequest,
  ExtensionAuthRefreshRequest,
  ExtensionAuthSession,
  ExtensionAuthRegisterRequest
} from "@weather-smart-money/core";

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1_000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_KEY_BYTES = 32;
const INVITE_CODES_ENV = process.env.EXTENSION_INVITE_CODES?.trim();
const ENV_READONLY_TOKEN = process.env.EXTENSION_READ_ONLY_TOKEN?.trim();

type ExtensionUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  passwordSalt: string;
  inviteCode?: string;
  memberLabel?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  disabledAt?: string | null;
};

const invitesByCode = new Map<string, string>();
const inviteBindings = new Map<string, string>();
const usersByEmail = new Map<string, ExtensionUser>();
const sessionsByAccess = new Map<string, ExtensionAuthSession>();
const sessionsByRefresh = new Map<string, ExtensionAuthSession>();

const randomToken = (bytes: number) => crypto.randomBytes(bytes).toString("hex");
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const isExpired = (timestamp: string) => Date.now() > new Date(timestamp).getTime();

const derivePasswordHash = (password: string, saltHex: string) =>
  crypto.pbkdf2Sync(password, Buffer.from(saltHex, "hex"), PASSWORD_ITERATIONS, PASSWORD_KEY_BYTES, "sha256").toString("hex");

const createPasswordRecord = (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    passwordSalt: salt,
    passwordHash: derivePasswordHash(password, salt)
  };
};

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

const sessionToResponse = (session: ExtensionAuthSession): ExtensionAuthExchangeResponse => ({
  userId: session.userId,
  userEmail: session.userEmail,
  memberLabel: session.memberLabel,
  inviteCode: session.inviteCode,
  accessToken: session.accessToken,
  refreshToken: session.refreshToken,
  expiresAt: session.expiresAt,
  refreshExpiresAt: session.refreshExpiresAt
});

const createSession = (input: {
  userId?: string;
  userEmail?: string;
  inviteCode: string;
  memberLabel: string;
  deviceLabel?: string;
  extensionVersion?: string;
}) => {
  const now = Date.now();
  const accessToken = randomToken(16);
  const refreshToken = randomToken(24);
  const session: ExtensionAuthSession = {
    userId: input.userId,
    userEmail: input.userEmail,
    memberLabel: input.memberLabel,
    inviteCode: input.inviteCode,
    deviceLabel: input.deviceLabel,
    extensionVersion: input.extensionVersion,
    accessToken,
    refreshToken,
    expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString()
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
    userId: session.userId,
    userEmail: session.userEmail,
    inviteCode: session.inviteCode,
    memberLabel: session.memberLabel,
    deviceLabel: session.deviceLabel,
    extensionVersion: session.extensionVersion
  });
};

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

const bindInvite = (inviteCode: string, normalizedEmail: string) => {
  const alreadyBound = inviteBindings.get(inviteCode);
  if (alreadyBound && alreadyBound !== normalizedEmail) {
    throw new Error("invite already bound to another user");
  }

  inviteBindings.set(inviteCode, normalizedEmail);
};

const upsertUserInvite = (user: ExtensionUser, inviteCode: string, memberLabel: string) => {
  bindInvite(inviteCode, user.normalizedEmail);
  const now = new Date().toISOString();
  user.inviteCode = inviteCode;
  user.memberLabel = memberLabel;
  user.updatedAt = now;
  usersByEmail.set(user.normalizedEmail, user);
};

const loginOrRegister = (payload: ExtensionAuthLoginRequest, requireInviteForNewUser: boolean) => {
  const normalizedEmail = normalizeEmail(payload.email ?? "");
  if (!normalizedEmail) {
    throw new Error("email is required");
  }

  const password = payload.password ?? "";
  if (!password) {
    throw new Error("password is required");
  }

  const user = usersByEmail.get(normalizedEmail);
  const inviteCode = payload.inviteCode?.trim();
  const inviteLabel = inviteCode ? inviteMemberLabel(inviteCode) : undefined;

  if (!user) {
    if (requireInviteForNewUser && !inviteCode) {
      throw new Error("inviteCode is required for first sign-in");
    }
    if (!inviteCode || !inviteLabel) {
      throw new Error("invalid invite");
    }
    if (password.length < 8) {
      throw new Error("password must be at least 8 characters");
    }

    bindInvite(inviteCode, normalizedEmail);
    const passwordRecord = createPasswordRecord(password);
    const createdAt = new Date().toISOString();
    const createdUser: ExtensionUser = {
      id: randomToken(12),
      email: normalizedEmail,
      normalizedEmail,
      passwordHash: passwordRecord.passwordHash,
      passwordSalt: passwordRecord.passwordSalt,
      inviteCode,
      memberLabel: inviteLabel,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: createdAt,
      disabledAt: null
    };
    usersByEmail.set(normalizedEmail, createdUser);

    return sessionToResponse(
      createSession({
        userId: createdUser.id,
        userEmail: createdUser.email,
        inviteCode,
        memberLabel: inviteLabel,
        deviceLabel: payload.deviceLabel?.trim(),
        extensionVersion: payload.extensionVersion?.trim()
      })
    );
  }

  if (user.disabledAt) {
    throw new Error("user disabled");
  }

  if (derivePasswordHash(password, user.passwordSalt) !== user.passwordHash) {
    throw new Error("invalid email or password");
  }

  if (!user.inviteCode) {
    if (!inviteCode || !inviteLabel) {
      throw new Error("inviteCode is required to bind this account");
    }
    upsertUserInvite(user, inviteCode, inviteLabel);
  } else if (inviteCode && inviteCode !== user.inviteCode) {
    throw new Error("this account is already bound to another invite");
  }

  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  usersByEmail.set(user.normalizedEmail, user);

  return sessionToResponse(
    createSession({
      userId: user.id,
      userEmail: user.email,
      inviteCode: user.inviteCode ?? inviteCode ?? "unbound",
      memberLabel: user.memberLabel ?? inviteLabel ?? user.email,
      deviceLabel: payload.deviceLabel?.trim(),
      extensionVersion: payload.extensionVersion?.trim()
    })
  );
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
  const inviteCode = payload.inviteCode.trim();
  const memberLabel = inviteMemberLabel(inviteCode);
  if (!memberLabel) {
    throw new Error("Invalid invite code");
  }

  if (inviteBindings.has(inviteCode)) {
    throw new Error("Invite is already bound to a user account");
  }

  const session = createSession({
    inviteCode,
    memberLabel,
    deviceLabel: payload.deviceLabel?.trim(),
    extensionVersion: payload.extensionVersion?.trim()
  });

  return sessionToResponse(session);
};

export const loginExtensionUser = (payload: ExtensionAuthLoginRequest): ExtensionAuthExchangeResponse =>
  loginOrRegister(payload, false);

export const registerExtensionUser = (
  payload: ExtensionAuthRegisterRequest
): ExtensionAuthExchangeResponse => loginOrRegister(payload, true);

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
