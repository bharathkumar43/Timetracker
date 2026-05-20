import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/submissions?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date param required" }, { status: 400 });

  const submission = await prisma.dailySubmission.findUnique({
    where: { userId_date: { userId: session.user.id, date } },
  });

  return NextResponse.json({
    submitted: !!submission,
    submittedAt: submission?.submittedAt ?? null,
  });
}

// POST /api/submissions  — body: { date: "YYYY-MM-DD" }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date } = await req.json();
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const submission = await prisma.dailySubmission.upsert({
    where: { userId_date: { userId: session.user.id, date } },
    update: { submittedAt: new Date() },
    create: { userId: session.user.id, date },
  });

  return NextResponse.json(submission);
}
