"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { formatDuration, formatDate, todayString } from "@/lib/utils";

interface Task { id: string; name: string }
interface TimeEntry { id: string; taskId: string; duration: number; notes: string | null; task: Task }
interface DayData {
  entries: TimeEntry[];
  submitted: boolean;
  submittedAt: string | null;
}
type GroupedEntries = Record<string, DayData>;

function getLast30Days(): { from: string; to: string } {
  const to = todayString();
  const d = new Date();
  d.setDate(d.getDate() - 29);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from, to };
}

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [range, setRange] = useState(getLast30Days());
  const [grouped, setGrouped] = useState<GroupedEntries>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/history?from=${range.from}&to=${range.to}`);
    if (res.ok) setGrouped(await res.json());
    setLoading(false);
  }, [range]);

  useEffect(() => { if (status === "authenticated") fetchHistory(); }, [status, fetchHistory]);

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My History</h1>
            <p className="text-slate-500 text-sm mt-0.5">Your past time logs</p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">From</span>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
            </svg>
            <p className="text-slate-500 font-medium">No entries in this range</p>
            <p className="text-slate-400 text-sm mt-1">Start logging time on the dashboard</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedDates.map((date) => {
              const { entries, submitted, submittedAt } = grouped[date];
              const total = entries.reduce((s, e) => s + e.duration, 0);
              const isToday = date === todayString();

              return (
                <div key={date} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {/* Date header */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{formatDate(date)}</span>
                      {isToday && (
                        <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">Today</span>
                      )}
                      {submitted && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Submitted
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-lg">
                      {formatDuration(total)} total
                    </span>
                  </div>

                  {/* Entries */}
                  <div className="divide-y divide-slate-100">
                    {entries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{entry.task.name}</p>
                          {entry.notes && <p className="text-xs text-slate-400 mt-0.5">{entry.notes}</p>}
                        </div>
                        <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg">
                          {formatDuration(entry.duration)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
