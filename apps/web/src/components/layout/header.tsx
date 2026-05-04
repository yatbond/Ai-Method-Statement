"use client";

import { UserButton } from "@clerk/nextjs";
import type { AuthUser } from "@/lib/auth";

export default function Header({ user }: { user: AuthUser }) {
  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/85 px-8 py-4 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase text-slate-400">Prototype UI v2</div>
          <div className="text-sm text-slate-600">
            Workflow adjusted: Projects / Trades / Draft Editor / Conflict Review / Export Review
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
            </svg>
          </button>
          <div className="flex items-center gap-2 rounded-full bg-slate-950 py-1 pl-4 pr-1.5 text-sm font-medium text-white">
            <span className="max-w-48 truncate">{user.name}</span>
            <UserButton
              afterSignOutUrl="/login"
              appearance={{ elements: { avatarBox: "h-7 w-7" } }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
