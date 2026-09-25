import "server-only";

import { NextResponse } from "next/server";

import { ApiError, errorResponse } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/require-user";

export function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function success(data: unknown, init?: ResponseInit) {
  return noStore(NextResponse.json({ ok: true, data }, init));
}

export function failure(error: unknown) {
  return noStore(errorResponse(error));
}

function applicationOrigin(): string {
  const configured = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL)?.trim();
  if (!configured) throw new ApiError("Application origin is not configured", 500);
  let url: URL;
  try { url = new URL(configured); } catch { throw new ApiError("Application origin is not configured", 500); }
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:"))
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new ApiError("Application origin is not configured", 500);
  }
  return url.origin;
}

export async function mutationBody(request: Request): Promise<unknown> {
  if (request.headers.get("origin") !== applicationOrigin()) throw new AuthError("Mutation origin rejected", 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError("JSON request body required", 400);
  }
  try { return await request.json(); } catch { throw new ApiError("Invalid JSON request body", 400); }
}
