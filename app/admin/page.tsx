"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { formatDuration, formatDate, todayString } from "@/lib/utils";

interface Task { id: string; name: string; description: string | null; isDefault: boolean }
interface TimeEntry { id: string; taskId: string; date: string; duration: number; notes: string | null; task: Task }
interface UserWithEntries {
  id: string; name: string | null; email: string | null; role: string;
  submitted: boolean; submittedAt: string | null;
  submittedDates: string[];
  timeEntries: TimeEntry[];
}
interface SimpleUser { id: string; name: string | null; email: string | null; role: string }

type Tab = "overview" | "users" | "tasks";

const PRIVILEGED_ROLES = ["admin", "manager"];
const ROLE_LABELS: Record<string, string> = {
  engineer: "Engineer",
  developer: "Developer",
  manager: "Manager",
  admin: "Admin",
};
const ROLE_COLORS: Record<string, string> = {
  engineer: "bg-slate-100 text-slate-600",
  developer: "bg-emerald-100 text-emerald-700",
  manager: "bg-blue-100 text-blue-700",
  admin: "bg-amber-100 text-amber-700",
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");

  // ── Overview ──────────────────────────────────────────────────────────────────
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [usersWithEntries, setUsersWithEntries] = useState<UserWithEntries[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showTeamAnalytics, setShowTeamAnalytics] = useState(false);

  // ── Users ─────────────────────────────────────────────────────────────────────
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Auth guard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && !PRIVILEGED_ROLES.includes(session?.user?.role ?? "")) router.push("/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    const today = todayString();
    setFromDate(today);
    setToDate(today);
  }, []);

  const isAdmin = session?.user?.role === "admin";

  // ── Fetchers ──────────────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    setOverviewLoading(true);
    const res = await fetch(`/api/admin/users?from=${from}&to=${to}`);
    if (res.ok) setUsersWithEntries(await res.json());
    setOverviewLoading(false);
  }, []);

  const fetchAllUsers = useCallback(async () => {
    setUsersLoading(true);
    const res = await fetch("/api/admin/all-users");
    if (res.ok) setAllUsers(await res.json());
    setUsersLoading(false);
  }, []);

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
    setTasksLoading(false);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!PRIVILEGED_ROLES.includes(session?.user?.role ?? "")) return;
    if (fromDate && toDate) fetchOverview(fromDate, toDate);
    if (isAdmin) { fetchAllUsers(); fetchTasks(); }
  }, [status, session, fromDate, toDate, isAdmin, fetchOverview, fetchAllUsers, fetchTasks]);

  // ── CSV helpers ───────────────────────────────────────────────────────────────
  const buildCSVRows = (users: UserWithEntries[]) => {
    const rows = [["Name", "Email", "Date", "Task", "Duration (min)", "Notes", "Submitted"]];
    for (const user of users) {
      if (user.timeEntries.length === 0) {
        rows.push([user.name ?? "", user.email ?? "", `${fromDate} – ${toDate}`, "— no entries —", "0", "", "No"]);
      } else {
        for (const entry of user.timeEntries) {
          rows.push([
            user.name ?? "", user.email ?? "", entry.date,
            entry.task.name, String(entry.duration), entry.notes ?? "",
            user.submittedDates.includes(entry.date) ? "Yes" : "No",
          ]);
        }
      }
    }
    return rows;
  };

  const triggerDownload = (rows: string[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAllCSV = () => triggerDownload(buildCSVRows(filteredUsers), `time-report-${fromDate}-to-${toDate}.csv`);

  const exportUserCSV = (user: UserWithEntries) => {
    const safeName = (user.name ?? user.email ?? user.id).replace(/[^a-z0-9]/gi, "-");
    triggerDownload(buildCSVRows([user]), `${safeName}-${fromDate}-to-${toDate}.csv`);
  };

  // ── Role update ───────────────────────────────────────────────────────────────
  const updateRole = async (userId: string, newRole: string) => {
    setUpdatingRoleId(userId);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) setAllUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    setUpdatingRoleId(null);
  };

  // ── Task actions ──────────────────────────────────────────────────────────────
  const addTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    setAdding(true); setAddError("");
    const res = await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: newTaskDesc.trim() || null }),
    });
    if (res.ok) { setNewTaskName(""); setNewTaskDesc(""); await fetchTasks(); }
    else setAddError("Could not add task. It may already exist.");
    setAdding(false);
  };

  const deleteTask = async (id: string) => {
    setDeletingId(id);
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) await fetchTasks();
    setDeletingId(null);
  };

  // ── Guard ─────────────────────────────────────────────────────────────────────
  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Apply role filter + search
  const filteredUsers = usersWithEntries.filter((u) => {
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
    return matchesRole && matchesSearch;
  });

  const submitted = filteredUsers.filter((u) => u.submitted);
  const notSubmitted = filteredUsers.filter((u) => !u.submitted);
  const isRange = fromDate !== toDate;

  const BAR_COLORS = ["bg-blue-500","bg-emerald-500","bg-purple-500","bg-amber-500","bg-rose-500","bg-cyan-500","bg-orange-500","bg-indigo-500"];

  const overallTotal = filteredUsers.reduce((s, u) => s + u.timeEntries.reduce((ss, e) => ss + e.duration, 0), 0);
  const overallTaskTotals: Record<string, { name: string; minutes: number }> = {};
  for (const u of filteredUsers) {
    for (const entry of u.timeEntries) {
      if (!overallTaskTotals[entry.taskId]) overallTaskTotals[entry.taskId] = { name: entry.task.name, minutes: 0 };
      overallTaskTotals[entry.taskId].minutes += entry.duration;
    }
  }
  const overallTaskStats = Object.values(overallTaskTotals).sort((a, b) => b.minutes - a.minutes);
  const overallDateTotals: Record<string, number> = {};
  for (const u of filteredUsers) {
    for (const entry of u.timeEntries) {
      overallDateTotals[entry.date] = (overallDateTotals[entry.date] ?? 0) + entry.duration;
    }
  }
  const overallDailyStats = Object.entries(overallDateTotals).sort(([a], [b]) => a.localeCompare(b));
  const overallMaxDay = Math.max(...overallDailyStats.map(([, v]) => v), 1);
  const activeMembers = filteredUsers.filter((u) => u.timeEntries.length > 0).length;
  const avgPerMember = activeMembers > 0 ? Math.round(overallTotal / activeMembers) : 0;
  const submissionRate = filteredUsers.length > 0 ? Math.round((submitted.length / filteredUsers.length) * 100) : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Team Overview" },
    ...(isAdmin ? [{ key: "users" as Tab, label: "Manage Users" }] : []),
    ...(isAdmin ? [{ key: "tasks" as Tab, label: "Manage Tasks" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TEAM OVERVIEW ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            {/* Controls row */}
            <div className="flex flex-col gap-3">
              {/* Search + role filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="all">All Roles</option>
                  <option value="engineer">Engineer</option>
                  <option value="developer">Developer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Date range + export */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 font-medium">From</span>
                  <input type="date" value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-slate-500 font-medium">to</span>
                  <input type="date" value={toDate}
                    min={fromDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={exportAllCSV}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export All CSV
                </button>
              </div>
            </div>

            {/* Summary cards */}
            {!overviewLoading && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <p className="text-3xl font-bold text-slate-900">{filteredUsers.length}</p>
                  <p className="text-slate-500 text-sm mt-0.5">
                    {roleFilter === "all" ? "Total employees" : `${ROLE_LABELS[roleFilter] ?? roleFilter}s`}
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-700">{submitted.length}</p>
                  <p className="text-emerald-600 text-sm mt-0.5">Submitted</p>
                </div>
                <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{notSubmitted.length}</p>
                  <p className="text-red-500 text-sm mt-0.5">Not submitted</p>
                </div>
              </div>
            )}

            {/* Team Analytics */}
            {!overviewLoading && filteredUsers.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setShowTeamAnalytics(!showTeamAnalytics)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    <span className="font-semibold text-slate-800 text-sm">Team Analytics</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {roleFilter === "all" ? "All roles" : `${ROLE_LABELS[roleFilter] ?? roleFilter}s`} · {filteredUsers.length} {filteredUsers.length === 1 ? "member" : "members"}
                    </span>
                  </div>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${showTeamAnalytics ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {showTeamAnalytics && (
                  <div className="border-t border-slate-200 px-5 py-4 space-y-5 bg-slate-50/60">

                    {/* Summary stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                        <p className="text-lg font-bold text-slate-900">{formatDuration(overallTotal)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Total hours</p>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                        <p className="text-lg font-bold text-slate-900">{activeMembers}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Active members</p>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                        <p className="text-lg font-bold text-slate-900">{formatDuration(avgPerMember)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Avg per person</p>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                        <p className="text-lg font-bold text-slate-900">{submissionRate}%</p>
                        <p className="text-xs text-slate-500 mt-0.5">Submission rate</p>
                      </div>
                    </div>

                    {/* Task Breakdown */}
                    {overallTaskStats.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Task Breakdown — All Members</p>
                        {overallTaskStats.map((task, i) => {
                          const pct = overallTotal > 0 ? Math.round((task.minutes / overallTotal) * 100) : 0;
                          return (
                            <div key={task.name} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                                  <span className="text-slate-700 font-medium truncate">{task.name}</span>
                                  {i === 0 && overallTaskStats.length > 1 && (
                                    <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded flex-shrink-0">Most time</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                  <span className="text-xs text-slate-500">{pct}%</span>
                                  <span className="text-xs font-semibold text-slate-700 w-16 text-right">{formatDuration(task.minutes)}</span>
                                </div>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${BAR_COLORS[i % BAR_COLORS.length]}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Daily Trend */}
                    {isRange && overallDailyStats.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Daily Hours — Team Total</p>
                        <div className="space-y-1.5">
                          {overallDailyStats.map(([date, minutes]) => {
                            const barPct = Math.round((minutes / overallMaxDay) * 100);
                            return (
                              <div key={date} className="flex items-center gap-3">
                                <span className="text-xs text-slate-500 w-24 flex-shrink-0">{formatDate(date)}</span>
                                <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all bg-blue-400"
                                    style={{ width: `${barPct}%` }} />
                                </div>
                                <span className="text-xs font-semibold text-slate-700 w-14 text-right flex-shrink-0">{formatDuration(minutes)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            {/* User list */}
            {overviewLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.length === 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
                    {searchQuery ? `No users match "${searchQuery}"` : "No users found for the selected filters."}
                  </div>
                )}
                {filteredUsers.map((user) => {
                  const total = user.timeEntries.reduce((s, e) => s + e.duration, 0);
                  const hasEntries = user.timeEntries.length > 0;
                  const isExpanded = expandedId === user.id;

                  // Group entries by date
                  const byDate: Record<string, TimeEntry[]> = {};
                  for (const entry of user.timeEntries) {
                    (byDate[entry.date] ??= []).push(entry);
                  }
                  const dates = Object.keys(byDate).sort();

                  // Analytics computations
                  const taskTotals: Record<string, { name: string; minutes: number }> = {};
                  for (const entry of user.timeEntries) {
                    if (!taskTotals[entry.taskId]) taskTotals[entry.taskId] = { name: entry.task.name, minutes: 0 };
                    taskTotals[entry.taskId].minutes += entry.duration;
                  }
                  const taskStats = Object.values(taskTotals).sort((a, b) => b.minutes - a.minutes);

                  const dateTotals: Record<string, number> = {};
                  for (const entry of user.timeEntries) {
                    dateTotals[entry.date] = (dateTotals[entry.date] ?? 0) + entry.duration;
                  }
                  const dailyStats = Object.entries(dateTotals).sort(([a], [b]) => a.localeCompare(b));
                  const maxDayMinutes = Math.max(...dailyStats.map(([, v]) => v), 1);

                  const daysLogged = Object.keys(dateTotals).length;
                  const avgPerDay = daysLogged > 0 ? Math.round(total / daysLogged) : 0;

                  return (
                    <div key={user.id} className={`bg-white rounded-xl border overflow-hidden ${
                      user.submitted ? "border-slate-200" : hasEntries ? "border-amber-200 bg-amber-50/20" : "border-red-200 bg-red-50/30"
                    }`}>
                      <div className="flex items-center justify-between px-5 py-4">
                        {/* Left: avatar + name */}
                        <button onClick={() => setExpandedId(isExpanded ? null : user.id)}
                          className="flex items-center gap-3 text-left flex-1 min-w-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                            user.submitted ? "bg-emerald-100 text-emerald-700" : hasEntries ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"
                          }`}>
                            {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-800 truncate">{user.name ?? "Unknown"}</p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-600"}`}>
                                {ROLE_LABELS[user.role] ?? user.role}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 truncate">{user.email}</p>
                          </div>
                        </button>

                        {/* Right: status + download + chevron */}
                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          {user.submitted ? (
                            <span className="text-sm font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">Submitted</span>
                          ) : hasEntries ? (
                            <span className="text-sm font-semibold text-amber-600 bg-amber-100 px-3 py-1 rounded-full">{formatDuration(total)} saved</span>
                          ) : (
                            <span className="text-sm font-semibold text-red-500 bg-red-100 px-3 py-1 rounded-full">No entries</span>
                          )}
                          <button onClick={() => exportUserCSV(user)} title="Download CSV"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </button>
                          <button onClick={() => setExpandedId(isExpanded ? null : user.id)}>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Expanded panel */}
                      {isExpanded && (
                        <div className="border-t border-slate-200">
                          {!hasEntries ? (
                            <div className="px-5 py-8 text-center text-slate-400 text-sm">
                              No time logged{isRange ? ` between ${formatDate(fromDate)} and ${formatDate(toDate)}` : ` for ${formatDate(fromDate)}`}
                            </div>
                          ) : (
                            <>
                              {/* ── Analytics section ── */}
                              <div className="px-5 py-4 space-y-5 bg-slate-50/60">

                                {/* Summary stats */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                                    <p className="text-lg font-bold text-slate-900">{formatDuration(total)}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Total time</p>
                                  </div>
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                                    <p className="text-lg font-bold text-slate-900">{daysLogged}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{daysLogged === 1 ? "Day logged" : "Days logged"}</p>
                                  </div>
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                                    <p className="text-lg font-bold text-slate-900">{formatDuration(avgPerDay)}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">Avg per day</p>
                                  </div>
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                                    <p className="text-lg font-bold text-slate-900">{user.submittedDates.length}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{user.submittedDates.length === 1 ? "Day submitted" : "Days submitted"}</p>
                                  </div>
                                </div>

                                {/* Task breakdown */}
                                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Task Breakdown</p>
                                  {taskStats.map((task, i) => {
                                    const pct = total > 0 ? Math.round((task.minutes / total) * 100) : 0;
                                    return (
                                      <div key={task.name} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                                            <span className="text-slate-700 font-medium truncate">{task.name}</span>
                                            {i === 0 && taskStats.length > 1 && (
                                              <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded flex-shrink-0">Most time</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                            <span className="text-xs text-slate-500">{pct}%</span>
                                            <span className="text-xs font-semibold text-slate-700 w-16 text-right">{formatDuration(task.minutes)}</span>
                                          </div>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all ${BAR_COLORS[i % BAR_COLORS.length]}`}
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Daily trend — only for range view */}
                                {isRange && dailyStats.length > 0 && (
                                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Daily Hours</p>
                                    <div className="space-y-1.5">
                                      {dailyStats.map(([date, minutes]) => {
                                        const barPct = Math.round((minutes / maxDayMinutes) * 100);
                                        const submitted = user.submittedDates.includes(date);
                                        return (
                                          <div key={date} className="flex items-center gap-3">
                                            <span className="text-xs text-slate-500 w-24 flex-shrink-0">{formatDate(date)}</span>
                                            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all ${submitted ? "bg-emerald-400" : "bg-blue-400"}`}
                                                style={{ width: `${barPct}%` }}
                                              />
                                            </div>
                                            <span className="text-xs font-semibold text-slate-700 w-14 text-right flex-shrink-0">{formatDuration(minutes)}</span>
                                            {submitted && <span className="text-xs text-emerald-600 w-16 flex-shrink-0">✓ submitted</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Green = submitted day · Blue = saved but not submitted</p>
                                  </div>
                                )}
                              </div>

                              {/* ── Entries detail ── */}
                              <div className="border-t border-slate-200">
                                <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Time Entries</p>
                                </div>
                                {isRange ? (
                                  <div className="divide-y divide-slate-100">
                                    {dates.map((date) => {
                                      const dayEntries = byDate[date];
                                      const dayTotal = dayEntries.reduce((s, e) => s + e.duration, 0);
                                      const daySubmitted = user.submittedDates.includes(date);
                                      return (
                                        <div key={date}>
                                          <div className="flex items-center justify-between px-5 py-2 bg-slate-50/80">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-semibold text-slate-700">{formatDate(date)}</span>
                                              {daySubmitted && <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Submitted</span>}
                                            </div>
                                            <span className="text-xs font-semibold text-slate-600">{formatDuration(dayTotal)}</span>
                                          </div>
                                          {dayEntries.map((entry) => (
                                            <div key={entry.id} className="grid grid-cols-[1fr_90px_1fr] gap-4 px-5 py-2.5 items-center">
                                              <p className="text-sm text-slate-800">{entry.task.name}</p>
                                              <p className="text-sm font-semibold text-emerald-700">{formatDuration(entry.duration)}</p>
                                              <p className="text-sm text-slate-400 truncate">{entry.notes ?? "—"}</p>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="divide-y divide-slate-100">
                                    <div className="grid grid-cols-[1fr_100px_1fr] gap-4 px-5 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                      <span>Task</span><span>Duration</span><span>Notes</span>
                                    </div>
                                    {user.timeEntries.map((entry) => (
                                      <div key={entry.id} className="grid grid-cols-[1fr_100px_1fr] gap-4 px-5 py-3 items-center">
                                        <p className="text-sm text-slate-800">{entry.task.name}</p>
                                        <p className="text-sm font-semibold text-emerald-700">{formatDuration(entry.duration)}</p>
                                        <p className="text-sm text-slate-400 truncate">{entry.notes ?? "—"}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── MANAGE USERS ──────────────────────────────────────────────────── */}
        {tab === "users" && isAdmin && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-sm">Assign roles to team members. Changes take effect on their next page load.</p>
              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{allUsers.length} users</span>
            </div>

            {usersLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <span className="w-9" />
                  <span>User</span>
                  <span className="w-44 text-center">Current Role</span>
                  <span className="w-52">Assign Role</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {allUsers.map((user) => (
                    <div key={user.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-3.5 items-center">
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-sm text-slate-600 flex-shrink-0">
                        {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{user.name ?? "—"}</p>
                        <p className="text-xs text-slate-400 truncate">{user.email}</p>
                      </div>
                      <div className="w-44 flex justify-center">
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-600"}`}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </div>
                      <div className="w-52 flex items-center gap-2">
                        <select
                          value={user.role}
                          disabled={updatingRoleId === user.id || user.id === session?.user?.id}
                          onChange={(e) => updateRole(user.id, e.target.value)}
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {!["engineer", "developer", "manager", "admin"].includes(user.role) && (
                            <option value={user.role} disabled>— Assign a role —</option>
                          )}
                          <option value="engineer">Engineer</option>
                          <option value="developer">Developer</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                        {updatingRoleId === user.id && (
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        )}
                        {user.id === session?.user?.id && (
                          <span className="text-xs text-slate-400 flex-shrink-0">You</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MANAGE TASKS ──────────────────────────────────────────────────── */}
        {tab === "tasks" && isAdmin && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-base font-semibold text-slate-800">Add New Task</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="text" placeholder="Task name (required)"
                  value={newTaskName} onChange={(e) => { setNewTaskName(e.target.value); setAddError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="Description (optional)"
                  value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addTask} disabled={adding || !newTaskName.trim()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors whitespace-nowrap">
                  {adding
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>}
                  Add Task
                </button>
              </div>
              {addError && <p className="text-red-500 text-sm">{addError}</p>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <span className="flex-1">Task</span>
                <span className="w-24 text-center">Type</span>
                <span className="w-28 text-right">Action</span>
              </div>
              {tasksLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="px-5 py-12 text-center text-slate-400 text-sm">No active tasks.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center px-5 py-3.5 gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{task.name}</p>
                        {task.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{task.description}</p>}
                      </div>
                      <span className={`w-24 text-center text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                        task.isDefault ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {task.isDefault ? "Default" : "Custom"}
                      </span>
                      <div className="w-28 flex justify-end flex-shrink-0">
                        <button onClick={() => deleteTask(task.id)} disabled={deletingId === task.id}
                          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                          {deletingId === task.id
                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>}
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
