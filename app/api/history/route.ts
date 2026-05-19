import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: session.user.id,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    include: { task: true },
    orderBy: [{ date: "desc" }, { task: { sortOrder: "asc" } }],
  });

  // Group by date
  const grouped: Record<string, typeof entries> = {};
  for (const entry of entries) {
    if (!grouped[entry.date]) grouped[entry.date] = [];
    grouped[entry.date].push(entry);
  }

  return NextResponse.json(grouped);
}
