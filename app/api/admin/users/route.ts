import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date param required" }, { status: 400 });

  const [users, submissions] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        timeEntries: {
          where: { date },
          include: { task: true },
          orderBy: { task: { sortOrder: "asc" } },
        },
      },
    }),
    prisma.dailySubmission.findMany({ where: { date } }),
  ]);

  const submittedUserIds = new Set(submissions.map((s) => s.userId));
  const result = users.map((u) => ({
    ...u,
    submitted: submittedUserIds.has(u.id),
    submittedAt: submissions.find((s) => s.userId === u.id)?.submittedAt ?? null,
  }));

  return NextResponse.json(result);
}
