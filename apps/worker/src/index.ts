import type { Env } from "./env";
import {
  handleAdminApprovalEmail,
  handleAuthExchange,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthRefresh,
  handleAuthRegister,
  handleAddressSearch,
  handleExtensionHealth,
  handleLabelsLookup,
  handleMarketAnnotations
} from "./routes";
import { withCors } from "./utils";

const ROUTES: Record<string, (request: Request, env: Env) => Promise<Response>> = {
  "/api/internal/admin/send-approval-email": handleAdminApprovalEmail,
  "/api/extension/auth/exchange": handleAuthExchange,
  "/api/extension/auth/login": handleAuthLogin,
  "/api/extension/auth/register": handleAuthRegister,
  "/api/extension/auth/refresh": handleAuthRefresh,
  "/api/extension/auth/logout": handleAuthLogout,
  "/api/extension/market-annotations": handleMarketAnnotations,
  "/api/extension/labels/lookup": handleLabelsLookup,
  "/api/extension/health": handleExtensionHealth,
  "/api/extension/search": handleAddressSearch
};

const handleOptions = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,If-None-Match",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    }
  });

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (!handler) {
      return withCors(new Response("Not found", { status: 404 }));
    }

    try {
      const response = await handler(request, env);
      return withCors(response);
    } catch (error) {
      return withCors(
        new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : "internal error"
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      );
    }
  }
};
