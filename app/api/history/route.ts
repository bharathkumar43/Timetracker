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

  const [entries, submissions] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        userId: session.user.id,
        ...(from && to ? { date: { gte: from, lte: to } } : {}),
      },
      include: { task: true },
      orderBy: [{ date: "desc" }, { task: { sortOrder: "asc" } }],
    }),
    prisma.dailySubmission.findMany({
      where: {
        userId: session.user.id,
        ...(from && to ? { date: { gte: from, lte: to } } : {}),
      },
    }),
  ]);

  const submissionMap = new Map(submissions.map((s) => [s.date, s.submittedAt]));

  const grouped: Record<string, { entries: typeof entries; submitted: boolean; submittedAt: string | null }> = {};
  for (const entry of entries) {
    if (!grouped[entry.date]) {
      grouped[entry.date] = {
        entries: [],
        submitted: submissionMap.has(entry.date),
        submittedAt: submissionMap.get(entry.date)?.toISOString() ?? null,
      };
    }
    grouped[entry.date].entries.push(entry);
  }

  return NextResponse.json(grouped);
}
