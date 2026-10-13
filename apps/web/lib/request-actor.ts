const HEADER_KEYS = [
  "cf-access-authenticated-user-email",
  "x-auth-request-email",
  "x-forwarded-email"
] as const;
const ACCESS_JWT_HEADERS = ["cf-access-jwt-assertion", "cf-access-token"] as const;

const isStrictAccessRequired = () =>
  process.env.NODE_ENV === "production" &&
  ["1", "true", "yes", "required"].includes((process.env.ADMIN_ACCESS_STRICT ?? "").trim().toLowerCase());

const hasAccessJwt = (request: Request) =>
  ACCESS_JWT_HEADERS.some((key) => Boolean(request.headers.get(key)?.trim()));

export const getRequestActor = (request: Request) => {
  if (isStrictAccessRequired() && !hasAccessJwt(request)) {
    return "Cloudflare Access required";
  }

  for (const key of HEADER_KEYS) {
    const value = request.headers.get(key)?.trim();
    if (value) {
      return value;
    }
  }

  return "Team Alpha";
};
