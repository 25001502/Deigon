import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/api/errors";
import { parseAddress } from "@/lib/account/parse-address";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const addresses = await prisma.address.findMany({ where: { userId: user.id }, orderBy: { id: "desc" } });
    return NextResponse.json({ ok: true, addresses });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const address = await prisma.address.create({ data: { userId: user.id, ...parseAddress(await request.json()) } });
    return NextResponse.json({ ok: true, address }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
