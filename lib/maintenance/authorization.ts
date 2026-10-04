import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type MaintenanceAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; message: string };

type BearerAuthorizationMessages = {
  unavailable: string;
  required: string;
  failed: string;
};

function configuredSecret(value: string | undefined): string | null {
  const secret = value?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function authorizeBearerRequest(
  request: Request,
  secret: string | null,
  messages: BearerAuthorizationMessages,
): MaintenanceAuthorizationResult {
  if (!secret) return { ok: false, status: 503, message: messages.unavailable };

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: messages.required };
  }

  const suppliedSecret = authorization.slice("Bearer ".length);
  if (!suppliedSecret || !secretsMatch(suppliedSecret, secret)) {
    return { ok: false, status: 403, message: messages.failed };
  }
  return { ok: true };
}

export function authorizeMaintenanceRequest(request: Request): MaintenanceAuthorizationResult {
  return authorizeBearerRequest(
    request,
    configuredSecret(process.env.DEIGON_MAINTENANCE_SECRET),
    {
      unavailable: "Maintenance is not configured.",
      required: "Maintenance authorization required.",
      failed: "Maintenance authorization failed.",
    },
  );
}

export function authorizeOrderEmailSchedulerRequest(
  request: Request,
): MaintenanceAuthorizationResult {
  return authorizeBearerRequest(
    request,
    configuredSecret(process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET),
    {
      unavailable: "Order email scheduler is not configured.",
      required: "Order email scheduler authorization required.",
      failed: "Order email scheduler authorization failed.",
    },
  );
}
