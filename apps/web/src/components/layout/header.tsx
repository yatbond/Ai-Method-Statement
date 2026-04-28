"use client";

import { UserButton } from "@clerk/nextjs";
import type { AuthUser } from "@/lib/auth";

export default function Header({ user }: { user: AuthUser }) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{user.name}</span>
        <UserButton afterSignOutUrl="/login" />
      </div>
    </header>
  );
}
