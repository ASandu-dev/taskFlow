import { PrismaClient } from "../src/.prisma-client-v2/client";

const prisma = new PrismaClient();

const today = new Date();
const todayStr = today.toISOString().split("T")[0];
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split("T")[0];

const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

// The bundled demo dataset uses fixed ids ("1".."5") and has no tenant scope.
// Once real (Clerk-synced) data or a family group exists, re-seeding would
// create unscoped rows that must never leak across tenants, so bail out.
async function hasRealData(): Promise<boolean> {
  const [familyGroups, scopedProjects, scopedGoals, scopedEvents, realUsers] =
    await Promise.all([
      prisma.familyGroup.count(),
      prisma.project.count({
        where: { OR: [{ ownerId: { not: null } }, { familyGroupId: { not: null } }] },
      }),
      prisma.goal.count({
        where: { OR: [{ ownerId: { not: null } }, { familyGroupId: { not: null } }] },
      }),
      prisma.calendarEvent.count({
        where: { OR: [{ ownerId: { not: null } }, { familyGroupId: { not: null } }] },
      }),
      prisma.user.count({ where: { id: { not: "1" } } }),
    ]);
  return (
    familyGroups > 0 ||
    scopedProjects > 0 ||
    scopedGoals > 0 ||
    scopedEvents > 0 ||
    realUsers > 0
  );
}

async function main() {
  // Demo rows are intentionally left with ownerId/familyGroupId null: no real
  // family exists at seed time, and the backend filters unscoped rows out.
  if (await hasRealData()) {
    console.log("Seed skipped: existing application data detected.");
    return;
  }

  const projects = await Promise.all(
    [
      { id: "1", name: "Personal", color: "#22c55e" },
      { id: "2", name: "Work", color: "#7c5cfc" },
      { id: "3", name: "Learning", color: "#3b82f6" },
      { id: "4", name: "Home", color: "#f59e0b" },
      { id: "5", name: "Ideas", color: "#ec4899" },
    ].map((project) =>
      prisma.project.upsert({ where: { id: project.id }, update: {}, create: project })
    )
  );

  const tasks = await Promise.all(
    [
      {
        id: "1",
        title: "Finish Next.js portfolio",
        projectId: "2",
        priority: "high" as const,
        status: "todo" as const,
        time: "10:00",
        date: todayStr,
        createdAt: yesterday,
      },
      {
        id: "2",
        title: "Update ScanSentinel README",
        projectId: "2",
        priority: "medium" as const,
        status: "todo" as const,
        time: "11:30",
        date: todayStr,
        createdAt: yesterday,
      },
      {
        id: "3",
        title: "Go for a walk",
        projectId: "1",
        priority: "low" as const,
        status: "done" as const,
        time: "12:00",
        date: todayStr,
        createdAt: twoDaysAgo,
      },
      {
        id: "4",
        title: "Plan learning for this week",
        projectId: "3",
        priority: "medium" as const,
        status: "todo" as const,
        time: "14:00",
        date: todayStr,
        createdAt: yesterday,
      },
      {
        id: "5",
        title: "Cook dinner",
        projectId: "4",
        priority: "low" as const,
        status: "todo" as const,
        time: "18:00",
        date: todayStr,
        createdAt: yesterday,
      },
      {
        id: "6",
        title: "Review PR #234",
        projectId: "2",
        priority: "high" as const,
        status: "done" as const,
        time: "09:00",
        date: "2026-10-05",
        createdAt: new Date("2026-10-04T09:00:00Z"),
      },
      {
        id: "7",
        title: "Read React 19 docs",
        projectId: "3",
        priority: "medium" as const,
        status: "todo" as const,
        time: "10:00",
        date: "2026-10-06",
        createdAt: new Date("2026-10-05T10:00:00Z"),
      },
      {
        id: "8",
        title: "Grocery shopping",
        projectId: "4",
        priority: "low" as const,
        status: "done" as const,
        time: "16:00",
        date: "2026-10-07",
        createdAt: new Date("2026-10-06T16:00:00Z"),
      },
      {
        id: "9",
        title: "Write blog post",
        projectId: "5",
        priority: "medium" as const,
        status: "todo" as const,
        time: "11:00",
        date: "2026-10-08",
        createdAt: new Date("2026-10-08T08:00:00Z"),
      },
      {
        id: "10",
        title: "Plan weekend trip",
        projectId: "1",
        priority: "low" as const,
        status: "todo" as const,
        time: "14:00",
        date: "2026-10-11",
        createdAt: new Date("2026-10-08T09:00:00Z"),
      },
    ].map((task) =>
      prisma.task.upsert({ where: { id: task.id }, update: {}, create: task })
    )
  );

  const events = await Promise.all(
    [
      {
        id: "1",
        title: "Team meeting",
        date: tomorrowStr,
        time: "10:00",
        color: "#3b82f6",
        category: "work",
        source: "local",
      },
      {
        id: "2",
        title: "Doctor appointment",
        date: "2026-10-09",
        time: "15:00",
        color: "#22c55e",
        category: "errands",
        source: "local",
      },
      {
        id: "3",
        title: "Family trip planning",
        date: "2026-10-10",
        time: "18:00",
        color: "#ec4899",
        category: "family",
        source: "local",
      },
    ].map((event) =>
      prisma.calendarEvent.upsert({
        where: { id: event.id },
        update: {},
        create: event,
      })
    )
  );

  const goals = await Promise.all(
    [
      { id: "1", title: "Read 12 books", progress: 7, target: 12, color: "#7c5cfc" },
      { id: "2", title: "Run 100 km", progress: 45, target: 100, color: "#22c55e" },
    ].map((goal) =>
      prisma.goal.upsert({ where: { id: goal.id }, update: {}, create: goal })
    )
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const user = await prisma.user.upsert({
    where: { id: "1" },
    update: {},
    create: {
      id: "1",
      name: "Andrei",
      plan: "Free Plan",
      avatarColor: "linear-gradient(135deg, #7c5cfc 0%, #3b82f6 100%)",
      initials: "A",
    },
  });

  console.log(`Seeded: ${projects.length} projects, ${tasks.length} tasks, ${events.length} events, ${goals.length} goals, 1 user`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
