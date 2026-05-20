"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { formatDuration, formatDate, todayString } from "@/lib/utils";

interface Task { id: string; name: string; description: string | null; isDefault: boolean }
interface TimeEntry { id: string; taskId: string; duration: number; notes: string | null; task: Task }
interface UserWithEntries {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  submitted: boolean;
  submittedAt: string | null;
  timeEntries: TimeEntry[];
}

type Tab = "overview" | "tasks";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");

  // ── Overview state ──────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [users, setUsers] = useState<UserWithEntries[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Task management state ───────────────────────────────────────────────────
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && session?.user?.role !== "admin") router.push("/dashboard");
  }, [status, session, router]);

  useEffect(() => { setSelectedDate(todayString()); }, []);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (date: string) => {
    if (!date) return;
    setOverviewLoading(true);
    const res = await fetch(`/api/admin/users?date=${date}`);
    if (res.ok) setUsers(await res.json());
    setOverviewLoading(false);
  }, []);

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
    setTasksLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "admin") {
      fetchUsers(selectedDate);
      fetchTasks();
    }
  }, [status, session, selectedDate, fetchUsers, fetchTasks]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [["Name", "Email", "Task", "Duration (min)", "Notes", "Date"]];
    for (const user of users) {
      if (user.timeEntries.length === 0) {
        rows.push([user.name ?? "", user.email ?? "", "— no entries —", "0", "", selectedDate]);
      } else {
        for (const entry of user.timeEntries) {
          rows.push([user.name ?? "", user.email ?? "", entry.task.name, String(entry.duration), entry.notes ?? "", selectedDate]);
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-report-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: newTaskDesc.trim() || null }),
    });
    if (res.ok) {
      setNewTaskName("");
      setNewTaskDesc("");
      await fetchTasks();
    } else {
      setAddError("Could not add task. It may already exist.");
    }
    setAdding(false);
  };

  const deleteTask = async (id: string) => {
    setDeletingId(id);
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) await fetchTasks();
    setDeletingId(null);
  };

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const submitted = users.filter((u) => u.submitted);
  const notSubmitted = users.filter((u) => !u.submitted);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Page header */}
        <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {(["overview", "tasks"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${
                tab === t
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "overview" ? "Team Overview" : "Manage Tasks"}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            {/* Sub-header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-slate-500 text-sm">{selectedDate ? formatDate(selectedDate) : ""}</p>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export CSV
                </button>
              </div>
            </div>

            {/* Summary cards */}
            {!overviewLoading && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <p className="text-3xl font-bold text-slate-900">{users.length}</p>
                  <p className="text-slate-500 text-sm mt-0.5">Total employees</p>
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


            {overviewLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => {
                  const totalMinutes = user.timeEntries.reduce((s, e) => s + e.duration, 0);
                  const hasEntries = user.timeEntries.length > 0;
                  const isExpanded = expandedId === user.id;
                  return (
                    <div key={user.id} className={`bg-white rounded-xl border overflow-hidden ${
                      user.submitted ? "border-slate-200"
                      : hasEntries ? "border-amber-200 bg-amber-50/20"
                      : "border-red-200 bg-red-50/30"
                    }`}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : user.id)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                            user.submitted ? "bg-emerald-100 text-emerald-700"
                            : hasEntries ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-500"
                          }`}>
                            {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{user.name ?? "Unknown"}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {user.submitted ? (
                            <span className="text-sm font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                              Submitted
                            </span>
                          ) : hasEntries ? (
                            <span className="text-sm font-semibold text-amber-600 bg-amber-100 px-3 py-1 rounded-full">
                              {formatDuration(totalMinutes)} (saved)
                            </span>
                          ) : (
                            <span className="text-sm font-semibold text-red-500 bg-red-100 px-3 py-1 rounded-full">
                              Not submitted
                            </span>
                          )}
                          <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-slate-200">
                          {hasEntries ? (
                            <div className="divide-y divide-slate-100">
                              <div className="grid grid-cols-[1fr_100px_1fr] gap-4 px-5 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                <span>Task</span><span>Duration</span><span>Notes</span>
                              </div>
                              {user.timeEntries.map((entry) => (
                                <div key={entry.id} className="grid grid-cols-[1fr_100px_1fr] gap-4 px-5 py-3 items-center">
                                  <p className="text-sm text-slate-800">{entry.task.name}</p>
                                  <p className="text-sm font-semibold text-emerald-700">{formatDuration(entry.duration)}</p>
                                  <p className="text-sm text-slate-400">{entry.notes ?? "—"}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="px-5 py-6 text-center text-slate-400 text-sm">
                              No time logged for {selectedDate ? formatDate(selectedDate) : ""}
                            </div>
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

        {/* ── MANAGE TASKS TAB ─────────────────────────────────────────────── */}
        {tab === "tasks" && (
          <div className="space-y-6">

            {/* Add task form */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-base font-semibold text-slate-800">Add New Task</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Task name (required)"
                  value={newTaskName}
                  onChange={(e) => { setNewTaskName(e.target.value); setAddError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addTask}
                  disabled={adding || !newTaskName.trim()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors whitespace-nowrap"
                >
                  {adding ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  )}
                  Add Task
                </button>
              </div>
              {addError && <p className="text-red-500 text-sm">{addError}</p>}
            </div>

            {/* Task list */}
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
                      {/* Task info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{task.name}</p>
                        {task.description && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{task.description}</p>
                        )}
                      </div>

                      {/* Badge */}
                      <span className={`w-24 text-center text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                        task.isDefault
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {task.isDefault ? "Default" : "Custom"}
                      </span>

                      {/* Delete button */}
                      <div className="w-28 flex justify-end flex-shrink-0">
                        <button
                          onClick={() => deleteTask(task.id)}
                          disabled={deletingId === task.id}
                          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {deletingId === task.id ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          )}
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
