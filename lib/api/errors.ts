import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { AuthError } from "@/lib/auth/require-user";

export class ApiError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "ApiError";
  }
}

// Central error → HTTP mapping so every products route returns consistent codes/shape.
export function errorResponse(error: unknown) {
  if (error instanceof AuthError || error instanceof ApiError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { ok: false, message: "A record with that unique value already exists" },
        { status: 409 },
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json({ ok: false, message: "Record not found" }, { status: 404 });
    }
  }

  console.error(error);
  return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
}
