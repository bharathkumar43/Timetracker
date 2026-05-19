import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TASKS = [
  { name: "Jira Tickets Monitoring", description: "Reviewing and updating Jira tickets", sortOrder: 1 },
  { name: "Customer Meetings", description: "Client calls, demos, and support sessions", sortOrder: 2 },
  { name: "Development / Coding", description: "Writing and reviewing feature code", sortOrder: 3 },
  { name: "Code Review", description: "Reviewing pull requests and providing feedback", sortOrder: 4 },
  { name: "Stand-up / Scrum", description: "Daily stand-up and sprint ceremonies", sortOrder: 5 },
  { name: "Internal Meetings", description: "Team syncs, planning, and brainstorming", sortOrder: 6 },
  { name: "Documentation", description: "Writing technical docs, runbooks, and wikis", sortOrder: 7 },
  { name: "Email & Communication", description: "Responding to emails and messages", sortOrder: 8 },
  { name: "Testing / QA", description: "Manual and automated testing", sortOrder: 9 },
  { name: "Bug Fixes", description: "Investigating and resolving bugs", sortOrder: 10 },
  { name: "Deployment & DevOps", description: "CI/CD, releases, and infrastructure", sortOrder: 11 },
  { name: "Learning & Training", description: "Courses, reading, and self-improvement", sortOrder: 12 },
  { name: "Project Planning", description: "Roadmap, estimates, and sprint planning", sortOrder: 13 },
  { name: "Administrative Tasks", description: "HR, timesheets, and other admin work", sortOrder: 14 },
];

async function main() {
  console.log("Seeding default tasks...");

  for (const task of DEFAULT_TASKS) {
    const existing = await prisma.task.findFirst({ where: { name: task.name } });
    if (!existing) {
      await prisma.task.create({
        data: {
          name: task.name,
          description: task.description,
          isDefault: true,
          sortOrder: task.sortOrder,
        },
      });
      console.log(`  ✓ Created: ${task.name}`);
    } else {
      console.log(`  — Exists:  ${task.name}`);
    }
  }

  console.log("\nSeed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
