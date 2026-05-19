import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/tasks — return all active tasks
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.task.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(tasks);
}

// POST /api/tasks — add a custom task (any employee can add)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = (body.name as string)?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  // Prevent duplicates
  const existing = await prisma.task.findFirst({ where: { name: { equals: name } } });
  if (existing) return NextResponse.json(existing);

  const task = await prisma.task.create({
    data: { name, description: body.description ?? null, isDefault: false },
  });

  return NextResponse.json(task, { status: 201 });
}
