import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { errorResponse } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { parseAddress } from "@/app/api/account/addresses/route";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ ok: false, message: "Address not found" }, { status: 404 });
    const address = await prisma.address.update({ where: { id }, data: parseAddress(await request.json()) });
    return NextResponse.json({ ok: true, address });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await prisma.address.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) return NextResponse.json({ ok: false, message: "Address not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
