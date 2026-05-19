import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users?date=YYYY-MM-DD
// Returns every user with their time entries for the given date
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date param required" }, { status: 400 });

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: {
      timeEntries: {
        where: { date },
        include: { task: true },
        orderBy: { task: { sortOrder: "asc" } },
      },
    },
  });

  return NextResponse.json(users);
}
