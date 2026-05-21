import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "manager"].includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const from = req.nextUrl.searchParams.get("from") ?? req.nextUrl.searchParams.get("date");
  const to   = req.nextUrl.searchParams.get("to")   ?? req.nextUrl.searchParams.get("date");
  if (!from || !to) return NextResponse.json({ error: "from and to params required" }, { status: 400 });

  const [users, submissions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        timeEntries: {
          where: { date: { gte: from, lte: to } },
          include: { task: true },
          orderBy: [{ date: "asc" }, { task: { sortOrder: "asc" } }],
        },
      },
    }),
    prisma.dailySubmission.findMany({
      where: { date: { gte: from, lte: to } },
    }),
  ]);

  const result = users.map((u) => {
    const userSubs = submissions.filter((s) => s.userId === u.id);
    return {
      ...u,
      submitted: userSubs.length > 0,
      submittedAt: userSubs[0]?.submittedAt ?? null,
      submittedDates: userSubs.map((s) => s.date),
    };
  });

  return NextResponse.json(result);
}
