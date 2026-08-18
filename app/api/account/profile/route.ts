import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => {
      throw new ApiError("Request body must be valid JSON", 400);
    });

    if (!body || typeof body !== "object") throw new ApiError("Request body must be an object", 400);
    if (body.name !== undefined && body.name !== null && typeof body.name !== "string") throw new ApiError("name must be a string or null", 400);
    if (body.phone !== undefined && body.phone !== null && typeof body.phone !== "string") throw new ApiError("phone must be a string or null", 400);

    const name = body.name === null ? null : typeof body.name === "string" ? body.name.trim() || null : undefined;
    const phone = body.phone === null ? null : typeof body.phone === "string" ? body.phone.trim() || null : undefined;
    if (typeof name === "string" && name.length > 120) throw new ApiError("name is too long", 400);
    if (typeof phone === "string" && phone.length > 40) throw new ApiError("phone is too long", 400);

    const profile = await prisma.user.update({
      where: { id: user.id },
      data: { ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}) },
      select: { id: true, email: true, name: true, phone: true, role: true },
    });

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return errorResponse(error);
  }
}
