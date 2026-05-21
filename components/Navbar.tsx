"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const role = session?.user?.role ?? "";
  const navLinks = [
    { href: "/dashboard", label: "Log Time" },
    { href: "/history", label: "My History" },
    ...(role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
    ...(role === "manager" ? [{ href: "/admin", label: "Team" }] : []),
  ];

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800 hidden sm:inline">Time Tracker</span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 hidden sm:inline truncate max-w-[160px]">
            {session?.user?.name ?? session?.user?.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-slate-500 hover:text-red-600 transition-colors font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
