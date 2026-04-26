"use client";

// =============================================================================
// Team Manager (project member management)
//
// Lists project members, allows role changes and removal.
// New members are added by email — they must have signed in via SSO first.
// ADMIN and MANAGER roles can manage the team.
// =============================================================================

import { useState } from "react";

const ROLES = ["ADMIN", "MANAGER", "ENGINEER", "PLANNER", "SAFETY", "COORDINATOR", "VIEWER"] as const;
type Role = (typeof ROLES)[number];

const ROLE_COLOR: Record<string, string> = {
  ADMIN:       "bg-red-50 text-red-700",
  MANAGER:     "bg-purple-50 text-purple-700",
  ENGINEER:    "bg-brand-50 text-brand-700",
  PLANNER:     "bg-blue-50 text-blue-700",
  SAFETY:      "bg-amber-50 text-amber-700",
  COORDINATOR: "bg-green-50 text-green-700",
  VIEWER:      "bg-gray-100 text-gray-600",
};

interface Member {
  id: string;
  role: Role;
  createdAt: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

interface Props {
  projectId: string;
  initialMembers: Member[];
  currentUserId: string;
  currentUserRole: Role;
}

function Avatar({ name, size = 7 }: { name: string | null; size?: number }) {
  const initials = (name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className={`w-${size} h-${size} rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0`}
    >
      {initials}
    </div>
  );
}

export default function TeamManager({
  projectId,
  initialMembers,
  currentUserId,
  currentUserRole,
}: Props) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<Role>("ENGINEER");
  const [adding, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Role>("ENGINEER");

  const canManage = ["ADMIN", "MANAGER"].includes(currentUserRole);

  async function addMember() {
    if (!addEmail.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add member."); return; }
      setMembers((prev) => [...prev, data.member]);
      setAddEmail("");
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(memberId: string, role: Role) {
    const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    }
    setEditingId(null);
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this team member from the project?")) return;
    const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to remove member.");
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
            <Avatar name={m.user.name} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{m.user.name ?? m.user.email}</p>
              <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
            </div>

            {editingId === m.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  onClick={() => updateRole(m.id, editRole)}
                  className="text-xs px-2 py-1 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[m.role] ?? "bg-gray-100 text-gray-600"}`}>
                  {m.role.toLowerCase()}
                </span>
                {canManage && m.user.id !== currentUserId && (
                  <>
                    <button
                      onClick={() => { setEditingId(m.id); setEditRole(m.role); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <>
          {showAdd ? (
            <div className="bg-white rounded-xl border border-brand-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700">Add team member</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="col-span-2 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as Role)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={addMember}
                    disabled={adding || !addEmail.trim()}
                    className="flex-1 text-sm px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {adding ? "Adding…" : "Add"}
                  </button>
                  <button
                    onClick={() => { setShowAdd(false); setError(null); }}
                    className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                The user must have signed in via SSO before they can be added.
              </p>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              + Add team member
            </button>
          )}
        </>
      )}
    </div>
  );
}
