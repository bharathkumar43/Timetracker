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
  durationInput: string;
  duration: number;
  notes: string;
  dirty: boolean;
  saving: boolean;
}

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [addTaskError, setAddTaskError] = useState("");

  useEffect(() => { setSelectedDate(todayString()); }, []);
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
  }, []);

  const fetchSubmissionStatus = useCallback(async (date: string) => {
    if (!date) return;
    try {
      const res = await fetch(`/api/submissions?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setIsSubmitted(data.submitted);
        setSubmittedAt(data.submittedAt);
      }
    } catch { /* non-critical */ }
  }, []);

  const fetchEntries = useCallback(async (date: string) => {
    if (!date) return;
    setLoading(true);
    const res = await fetch(`/api/entries?date=${date}`);
    if (!res.ok) { setLoading(false); return; }
    const entries: TimeEntry[] = await res.json();

    setRows(() => {
      const next: Record<string, RowState> = {};
      for (const task of tasks) {
        next[task.id] = { durationInput: "", duration: 0, notes: "", dirty: false, saving: false };
      }
      for (const entry of entries) {
        // Show "0" for explicitly saved zero-duration entries so they persist visually
        const displayInput = entry.duration > 0 ? formatDuration(entry.duration) : "0";
        next[entry.taskId] = {
          entryId: entry.id,
          durationInput: displayInput,
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
  useEffect(() => {
    if (tasks.length > 0 && selectedDate) fetchEntries(selectedDate);
  }, [tasks, selectedDate, fetchEntries]);
  useEffect(() => {
    if (selectedDate && status === "authenticated") {
      setIsSubmitted(false);
      setSubmittedAt(null);
      setSubmitError("");
      setSaveError("");
      setSaveStatus("idle");
      fetchSubmissionStatus(selectedDate);
    }
  }, [selectedDate, status, fetchSubmissionStatus]);

  const updateRow = (taskId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [taskId]: { ...prev[taskId], ...patch, dirty: true },
    }));
    setSaveStatus("idle");
    setSaveError("");
  };

  const handleDurationBlur = (taskId: string, input: string) => {
    const trimmed = input.trim().toUpperCase();
    if (trimmed === "" ) {
      // Empty — mark as dirty but clear (will delete existing entry if any)
      updateRow(taskId, { durationInput: "", duration: 0 });
      return;
    }
    if (trimmed === "0" || trimmed === "NA" || trimmed === "N/A") {
      // Explicit zero — normalise display to "0"
      updateRow(taskId, { durationInput: "0", duration: 0 });
      return;
    }
    const parsed = parseDuration(input);
    if (parsed !== null && parsed > 0) {
      updateRow(taskId, { durationInput: formatDuration(parsed), duration: parsed });
    } else {
      // Unrecognised — show as-is, duration 0
      updateRow(taskId, { durationInput: input, duration: 0 });
    }
  };

  // Saves a single row to the DB — duration 0 is allowed (explicit "not worked")
  const saveRow = async (taskId: string, date: string, row: RowState): Promise<void> => {
    setRows((prev) => ({ ...prev, [taskId]: { ...prev[taskId], saving: true } }));
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, date, duration: row.duration, notes: row.notes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Save failed (${res.status})`);
      }
      const entry = await res.json();
      setRows((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], entryId: entry.id, dirty: false, saving: false },
      }));
    } catch (e) {
      setRows((prev) => ({ ...prev, [taskId]: { ...prev[taskId], saving: false } }));
      throw e;
    }
  };

  const saveAll = async () => {
    setSaveAllLoading(true);
    setSaveError("");

    try {
      // Flush any typed-but-unblurred inputs
      const flushed = { ...rows };
      for (const [taskId, row] of Object.entries(flushed)) {
        if (row.dirty && row.durationInput.trim()) {
          const trimmed = row.durationInput.trim().toUpperCase();
          if (trimmed === "0" || trimmed === "NA" || trimmed === "N/A") {
            flushed[taskId] = { ...row, durationInput: "0", duration: 0 };
          } else if (row.duration === 0) {
            const parsed = parseDuration(row.durationInput);
            if (parsed !== null && parsed > 0) {
              flushed[taskId] = { ...row, duration: parsed, durationInput: formatDuration(parsed) };
            }
          }
        }
      }
      setRows(flushed);

      // Save every dirty row that has something typed (including "0" / "NA")
      // durationInput non-empty = user explicitly filled this cell
      const toSave = Object.entries(flushed).filter(
        ([, r]) => r.dirty && r.durationInput.trim() !== ""
      );
      await Promise.all(toSave.map(([taskId, row]) => saveRow(taskId, selectedDate, row)));

      // Delete entries the user explicitly cleared (had a saved entry, now input is empty)
      const toDelete = Object.entries(flushed).filter(
        ([, r]) => r.dirty && r.durationInput.trim() === "" && r.entryId
      );
      await Promise.all(
        toDelete.map(([, row]) =>
          fetch(`/api/entries/${row.entryId}`, { method: "DELETE" })
        )
      );

      // Mark remaining dirty rows (blank, no prior entry) as clean
      setRows((prev) => {
        const next = { ...prev };
        for (const taskId of Object.keys(next)) {
          if (next[taskId].dirty) {
            next[taskId] = { ...next[taskId], dirty: false, saving: false };
          }
        }
        return next;
      });

      if (toDelete.length > 0) await fetchEntries(selectedDate);

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setSaveAllLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsSubmitted(true);
        setSubmittedAt(data.submittedAt);
      } else {
        const err = await res.json().catch(() => ({}));
        setSubmitError(err?.error ?? `Submit failed (${res.status}). Please try again.`);
      }
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
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
  const dirtyCount = Object.values(rows).filter((r) => r.dirty).length;

  // Any row with a saved entry (even duration=0) counts — user explicitly filled this cell
  const hasSavedEntries = Object.values(rows).some((r) => r.entryId !== undefined);
  const canSubmit = !submitting && dirtyCount === 0 && hasSavedEntries;

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

        {/* Header */}
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
              <p className="text-blue-600 text-xs">{Object.values(rows).filter((r) => r.duration > 0).length} tasks with time</p>
            </div>
          </div>
        )}

        {/* Task table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_1fr] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
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
                const hasTime = row.duration > 0;
                // A saved "0" entry still has an entryId — show it differently from blank
                const isSavedZero = row.entryId !== undefined && row.duration === 0;

                return (
                  <div
                    key={task.id}
                    className={`grid grid-cols-[1fr_160px_1fr] gap-4 px-5 py-3.5 items-center transition-colors ${
                      hasTime ? "bg-emerald-50/40" : isSavedZero ? "bg-slate-50/60" : "hover:bg-slate-50/40"
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-medium ${hasTime ? "text-slate-900" : "text-slate-700"}`}>
                        {task.name}
                      </p>
                      {task.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{task.description}</p>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. 1h, 30m, 0, NA"
                        value={row.durationInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          const trimmed = val.trim().toUpperCase();
                          if (trimmed === "0" || trimmed === "NA" || trimmed === "N/A") {
                            updateRow(task.id, { durationInput: val, duration: 0 });
                            return;
                          }
                          const parsed = parseDuration(val);
                          updateRow(task.id,
                            parsed !== null && parsed > 0
                              ? { durationInput: val, duration: parsed }
                              : { durationInput: val, duration: 0 }
                          );
                        }}
                        onBlur={(e) => handleDurationBlur(task.id, e.target.value)}
                        className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                          hasTime
                            ? "border-emerald-300 bg-white text-emerald-800 font-medium"
                            : isSavedZero
                            ? "border-slate-300 bg-white text-slate-500"
                            : "border-slate-300 bg-white"
                        }`}
                      />
                      {row.saving && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>

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
                placeholder="Task name"
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

        {/* Action bar */}
        <div className="space-y-3 pt-2">

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

          {saveStatus === "error" && saveError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-red-700 text-sm font-medium">{saveError}</p>
            </div>
          )}

          {submitError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-red-700 text-sm font-medium">{submitError}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm">
              {dirtyCount > 0 && (
                <span className="text-amber-600 font-medium">
                  {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""} — click Save All first
                </span>
              )}
              {saveStatus === "saved" && dirtyCount === 0 && (
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Saved!
                </span>
              )}
              {!hasSavedEntries && dirtyCount === 0 && !loading && tasks.length > 0 && saveStatus === "idle" && (
                <span className="text-slate-400 text-xs">
                  Fill in your time (or 0 / NA for tasks not worked), then Save All
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
                disabled={!canSubmit}
                title={
                  dirtyCount > 0 ? "Save your changes first" :
                  !hasSavedEntries ? "Fill in your timesheet and click Save All first" : ""
                }
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
