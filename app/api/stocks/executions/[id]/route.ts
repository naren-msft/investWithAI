import { NextResponse } from "next/server";
import { deleteExecution } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = await deleteExecution(params.id, "stocks");
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ deleted: params.id });
}
