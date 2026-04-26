"use client";

// =============================================================================
// Sequence Diagram (P12 — v1.2, REQ-VISUAL)
//
// Renders a construction sequence as a visual step-by-step flow.
// Data comes from the TradePack.typicalSequences field (string[]).
// The component is purely presentational — no AI calls.
// =============================================================================

interface Props {
  steps: string[];
  title?: string;
  compact?: boolean;
}

export default function SequenceDiagram({ steps, title, compact = false }: Props) {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-1">
      {title && (
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      )}
      <div className="relative">
        {/* Vertical connector line */}
        <div
          className="absolute left-4 top-4 bottom-4 w-0.5 bg-brand-100"
          aria-hidden
        />

        <ol className="space-y-2 relative">
          {steps.map((step, i) => {
            const isFirst = i === 0;
            const isLast = i === steps.length - 1;
            // Parse optional substep syntax: "1. Main step [→ sub-note]"
            const [main, sub] = step.replace(/^\d+\.\s*/, "").split(/\[→\s*/);
            const subNote = sub ? sub.replace(/\]$/, "").trim() : null;

            return (
              <li key={i} className="flex items-start gap-3">
                {/* Step circle */}
                <div
                  className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm border-2 ${
                    isFirst
                      ? "bg-brand-600 border-brand-600 text-white"
                      : isLast
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-white border-brand-300 text-brand-700"
                  }`}
                >
                  {isLast ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>

                {/* Step content */}
                <div className={`flex-1 min-w-0 ${compact ? "py-1" : "py-1.5"}`}>
                  <p className={`${compact ? "text-xs" : "text-sm"} text-gray-800 font-medium leading-snug`}>
                    {main.trim()}
                  </p>
                  {subNote && (
                    <p className="text-xs text-gray-400 mt-0.5 italic">{subNote}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
