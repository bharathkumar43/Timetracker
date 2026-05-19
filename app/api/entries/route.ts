import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/entries?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date param required" }, { status: 400 });

  const entries = await prisma.timeEntry.findMany({
    where: { userId: session.user.id, date },
    include: { task: true },
    orderBy: { task: { sortOrder: "asc" } },
  });

  return NextResponse.json(entries);
}

// POST /api/entries  — upsert a single entry
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { taskId, date, duration, notes } = body as {
    taskId: string;
    date: string;
    duration: number;
    notes?: string;
  };

  if (!taskId || !date || typeof duration !== "number" || duration < 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const entry = await prisma.timeEntry.upsert({
    where: { userId_taskId_date: { userId: session.user.id, taskId, date } },
    create: { userId: session.user.id, taskId, date, duration, notes },
    update: { duration, notes },
    include: { task: true },
  });

  return NextResponse.json(entry);
}
