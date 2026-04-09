const HEADER_KEYS = [
  "cf-access-authenticated-user-email",
  "x-auth-request-email",
  "x-forwarded-email"
] as const;

export const getRequestActor = (request: Request) => {
  for (const key of HEADER_KEYS) {
    const value = request.headers.get(key)?.trim();
    if (value) {
      return value;
    }
  }

  return "Team Alpha";
};
