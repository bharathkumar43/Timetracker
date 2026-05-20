"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { formatDuration, parseDuration, todayString, formatDate } from "@/lib/utils";

interface Task {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

interface TimeEntry {
  id: string;
  taskId: string;
  duration: number;
  notes: string | null;
}

interface RowState {
  entryId?: string;
  durationInput: string; // raw text the user is typing
  duration: number;      // parsed minutes (0 = not set)
  notes: string;
  dirty: boolean;        // unsaved change
  saving: boolean;
}

function durationDisplay(minutes: number): string {
  return minutes > 0 ? formatDuration(minutes) : "";
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<string>("");

  useEffect(() => {
    setSelectedDate(todayString());
  }, []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Custom task modal state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [addTaskError, setAddTaskError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
  }, []);

  const fetchSubmissionStatus = useCallback(async (date: string) => {
    if (!date) return;
    const res = await fetch(`/api/submissions?date=${date}`);
    if (res.ok) {
      const data = await res.json();
      setIsSubmitted(data.submitted);
      setSubmittedAt(data.submittedAt);
    }
  }, []);

  const fetchEntries = useCallback(async (date: string) => {
    setLoading(true);
    const res = await fetch(`/api/entries?date=${date}`);
    if (!res.ok) { setLoading(false); return; }
    const entries: TimeEntry[] = await res.json();

    setRows((prev) => {
      const next: Record<string, RowState> = { ...prev };
      // Reset all rows for fresh date
      for (const task of tasks) {
        next[task.id] = { durationInput: "", duration: 0, notes: "", dirty: false, saving: false };
      }
      // Populate from saved entries
      for (const entry of entries) {
        next[entry.taskId] = {
          entryId: entry.id,
          durationInput: entry.duration > 0 ? formatDuration(entry.duration) : "",
          duration: entry.duration,
          notes: entry.notes ?? "",
          dirty: false,
          saving: false,
        };
      }
      return next;
    });
    setLoading(false);
  }, [tasks]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { if (tasks.length > 0) fetchEntries(selectedDate); }, [tasks, selectedDate, fetchEntries]);
  useEffect(() => {
    if (selectedDate && status === "authenticated") fetchSubmissionStatus(selectedDate);
  }, [selectedDate, status, fetchSubmissionStatus]);

  const updateRow = (taskId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...patch, dirty: true } }));
    setSaveStatus("idle");
  };

  const handleDurationBlur = (taskId: string, input: string) => {
    const parsed = parseDuration(input);
    if (input === "") {
      updateRow(taskId, { durationInput: "", duration: 0 });
    } else if (parsed !== null) {
      updateRow(taskId, { durationInput: formatDuration(parsed), duration: parsed });
    } else {
      // Invalid — keep input, mark duration 0
      updateRow(taskId, { duration: 0 });
    }
  };

  const saveRow = async (taskId: string, rowData?: RowState) => {
    const row = rowData ?? rows[taskId];
    if (!row || row.duration === 0) return;

    setRows((prev) => ({ ...prev, [taskId]: { ...prev[taskId], saving: true } }));

    const method = row.entryId ? "PATCH" : "POST";
    const url = row.entryId ? `/api/entries/${row.entryId}` : "/api/entries";
    const body = row.entryId
      ? { duration: row.duration, notes: row.notes }
      : { taskId, date: selectedDate, duration: row.duration, notes: row.notes };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const entry = await res.json();
      setRows((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], entryId: entry.id, dirty: false, saving: false },
      }));
    } else {
      setRows((prev) => ({ ...prev, [taskId]: { ...prev[taskId], saving: false } }));
    }
  };

  const saveAll = async () => {
    setSaveAllLoading(true);

    // Flush any duration inputs that were typed but not yet blurred
    const flushed = { ...rows };
    for (const [taskId, row] of Object.entries(flushed)) {
      if (row.dirty && row.durationInput.trim() && row.duration === 0) {
        const parsed = parseDuration(row.durationInput);
        if (parsed !== null && parsed > 0) {
          flushed[taskId] = { ...row, duration: parsed, durationInput: formatDuration(parsed) };
        }
      }
    }
    setRows(flushed);

    const dirtyRows = Object.entries(flushed).filter(([, r]) => r.dirty && r.duration > 0);
    await Promise.all(dirtyRows.map(([taskId, row]) => saveRow(taskId, row)));

    // Delete rows that were cleared (duration = 0, but had a saved entry)
    const cleared = Object.entries(rows).filter(([, r]) => r.dirty && r.duration === 0 && r.entryId);
    for (const [, row] of cleared) {
      await fetch(`/api/entries/${row.entryId}`, { method: "DELETE" });
    }
    if (cleared.length > 0) await fetchEntries(selectedDate);

    setSaveAllLoading(false);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 3000);
  };

  const handleSubmit = async () => {
    if (dirtyCount > 0) await saveAll();
    setSubmitting(true);
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selectedDate }),
    });
    if (res.ok) {
      const data = await res.json();
      setIsSubmitted(true);
      setSubmittedAt(data.submittedAt);
    }
    setSubmitting(false);
  };

  const addCustomTask = async () => {
    const name = newTaskName.trim();
    if (!name) return;
    setAddingTask(true);
    setAddTaskError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      await fetchTasks();
      setNewTaskName("");
      setShowAddTask(false);
    } else {
      setAddTaskError("Could not add task. Please try again.");
    }
    setAddingTask(false);
  };

  const totalMinutes = Object.values(rows).reduce((sum, r) => sum + r.duration, 0);
  const dirtyCount = Object.values(rows).filter(
    (r) => r.dirty && (r.duration > 0 || r.durationInput.trim() !== "")
  ).length;
  const isToday = selectedDate === todayString();
  const hasSavedEntries = Object.values(rows).some((r) => r.entryId && r.duration > 0);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Log Your Time</h1>
            <p className="text-slate-500 text-sm mt-0.5">{selectedDate ? formatDate(selectedDate) : ""}</p>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Total time badge */}
        {totalMinutes > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-blue-900 font-semibold">{formatDuration(totalMinutes)} logged</p>
              <p className="text-blue-600 text-xs">{Object.values(rows).filter((r) => r.duration > 0).length} tasks</p>
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_140px_1fr] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Task</span>
            <span>Time Spent</span>
            <span>Notes (optional)</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tasks.map((task) => {
                const row = rows[task.id] ?? { durationInput: "", duration: 0, notes: "", dirty: false, saving: false };
                const hasValue = row.duration > 0;

                return (
                  <div
                    key={task.id}
                    className={`grid grid-cols-[1fr_140px_1fr] gap-4 px-5 py-3.5 items-center transition-colors ${
                      hasValue ? "bg-emerald-50/40" : "hover:bg-slate-50/60"
                    }`}
                  >
                    {/* Task name */}
                    <div>
                      <p className={`text-sm font-medium ${hasValue ? "text-slate-900" : "text-slate-700"}`}>
                        {task.name}
                      </p>
                      {task.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{task.description}</p>
                      )}
                    </div>

                    {/* Duration input */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. 30m, 1h, 1:30"
                        value={row.durationInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          const parsed = parseDuration(val);
                          updateRow(task.id, parsed !== null
                            ? { durationInput: val, duration: parsed }
                            : { durationInput: val }
                          );
                        }}
                        onBlur={(e) => handleDurationBlur(task.id, e.target.value)}
                        className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                          hasValue
                            ? "border-emerald-300 bg-white text-emerald-800 font-medium"
                            : "border-slate-300 bg-white"
                        }`}
                      />
                      {row.saving && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <input
                      type="text"
                      placeholder="Add a note..."
                      value={row.notes}
                      onChange={(e) => updateRow(task.id, { notes: e.target.value })}
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add custom task */}
        {!showAddTask ? (
          <button
            onClick={() => setShowAddTask(true)}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add custom task
          </button>
        ) : (
          <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">New custom task</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Task name (e.g. Internal hackathon)"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomTask()}
                autoFocus
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addCustomTask}
                disabled={addingTask || !newTaskName.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {addingTask ? "Adding…" : "Add"}
              </button>
              <button
                onClick={() => { setShowAddTask(false); setNewTaskName(""); setAddTaskError(""); }}
                className="text-slate-500 hover:text-slate-700 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>
            {addTaskError && <p className="text-red-500 text-xs">{addTaskError}</p>}
          </div>
        )}

        {/* Save bar */}
        <div className="space-y-3 pt-2">
          {/* Submission status */}
          {isSubmitted && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-emerald-800 font-semibold text-sm">Timesheet submitted</p>
                {submittedAt && (
                  <p className="text-emerald-600 text-xs">
                    {new Date(submittedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              {dirtyCount > 0 && (
                <span className="text-amber-600 font-medium">{dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}</span>
              )}
              {saveStatus === "saved" && (
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Saved!
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveAll}
                disabled={saveAllLoading || dirtyCount === 0}
                className="bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-300 font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2 text-sm"
              >
                {saveAllLoading && (
                  <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                )}
                {saveAllLoading ? "Saving…" : "Save All"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (!hasSavedEntries && dirtyCount === 0)}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {submitting ? "Submitting…" : isSubmitted ? "Re-submit" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
