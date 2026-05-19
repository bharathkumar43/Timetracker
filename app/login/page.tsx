"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/dashboard");
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-md text-center space-y-6">
        {/* Logo / Icon */}
        <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
          <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time Tracker</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Log your daily work hours across tasks
          </p>
        </div>

        <button
          onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
          className="w-full flex items-center justify-center gap-3 bg-[#0078d4] hover:bg-[#006cbd] text-white font-semibold py-3 px-6 rounded-xl transition-colors"
        >
          {/* Microsoft logo */}
          <svg viewBox="0 0 21 21" className="w-5 h-5 fill-current">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft
        </button>

        <p className="text-xs text-slate-400">
          Use your company email to sign in
        </p>
      </div>
    </div>
  );
}
