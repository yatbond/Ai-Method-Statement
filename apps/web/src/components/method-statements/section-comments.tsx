"use client";

// =============================================================================
// Section Comments (P13 — review workflow)
//
// Threaded review comments on a drafted section. Reviewers leave comments;
// authors reply and mark resolved. Used during IN_REVIEW sign-off.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CommentAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

interface CommentData {
  id: string;
  content: string;
  resolved: boolean;
  createdAt: string;
  author: CommentAuthor;
  replies?: CommentData[];
}

interface Props {
  sectionId: string;
  currentUserId?: string;
}

function Avatar({ author }: { author: CommentAuthor }) {
  const initials = (author.name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">
      {initials}
    </div>
  );
}

function CommentItem({
  comment,
  sectionId,
  currentUserId,
  depth = 0,
  onUpdated,
}: {
  comment: CommentData;
  sectionId: string;
  currentUserId?: string;
  depth?: number;
  onUpdated: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  async function toggleResolved() {
    await fetch(`/api/sections/${sectionId}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !comment.resolved }),
    });
    onUpdated();
  }

  async function submitReply() {
    if (!replyText.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/sections/${sectionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim(), parentId: comment.id }),
      });
      setReplyText("");
      setReplying(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function deleteComment() {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/sections/${sectionId}/comments/${comment.id}`, { method: "DELETE" });
    onUpdated();
  }

  const isAuthor = currentUserId === comment.author.id;
  const timeAgo = new Date(comment.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className={cn("flex gap-2.5", depth > 0 && "ml-8 mt-2")}>
      <Avatar author={comment.author} />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "rounded-xl px-3 py-2.5",
            comment.resolved ? "bg-gray-50 opacity-60" : "bg-gray-100"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-800">{comment.author.name ?? "Unknown"}</span>
            <span className="text-xs text-gray-400">{timeAgo}</span>
            {comment.resolved && (
              <span className="text-xs text-green-600 font-medium">✓ Resolved</span>
            )}
          </div>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
        </div>

        <div className="flex items-center gap-3 mt-1 px-1">
          {depth === 0 && (
            <button
              onClick={() => setReplying((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Reply
            </button>
          )}
          <button
            onClick={toggleResolved}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {comment.resolved ? "Unresolve" : "Resolve"}
          </button>
          {isAuthor && (
            <button
              onClick={deleteComment}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Delete
            </button>
          )}
        </div>

        {replying && (
          <div className="mt-2 flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              placeholder="Write a reply…"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={submitReply}
                disabled={saving || !replyText.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "…" : "Reply"}
              </button>
              <button
                onClick={() => setReplying(false)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {(comment.replies ?? []).map((reply) => (
          <CommentItem
            key={reply.id}
            comment={reply}
            sectionId={sectionId}
            currentUserId={currentUserId}
            depth={depth + 1}
            onUpdated={onUpdated}
          />
        ))}
      </div>
    </div>
  );
}

export default function SectionComments({ sectionId, currentUserId }: Props) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sections/${sectionId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    if (open) fetchComments();
  }, [open, fetchComments]);

  async function postComment() {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await fetch(`/api/sections/${sectionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      setNewComment("");
      await fetchComments();
    } finally {
      setPosting(false);
    }
  }

  const unresolved = comments.filter((c) => !c.resolved).length;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        {comments.length > 0
          ? `${comments.length} comment${comments.length !== 1 ? "s" : ""}${unresolved > 0 ? ` · ${unresolved} open` : " · all resolved"}`
          : "Add comment"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : (
            comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                sectionId={sectionId}
                currentUserId={currentUserId}
                onUpdated={fetchComments}
              />
            ))
          )}

          {/* New comment */}
          <div className="flex gap-2 pt-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              placeholder="Leave a review comment…"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
            <button
              onClick={postComment}
              disabled={posting || !newComment.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors self-end"
            >
              {posting ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
