"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  source: string;
  id: string;
}

export default function MermaidRenderer({ source, id }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });

        const graphId = `mermaid-${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const { svg } = await mermaid.render(graphId, source);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to render diagram.");
      }
    }

    render();
    return () => { cancelled = true; };
  }, [source, id]);

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 font-mono whitespace-pre-wrap">
        Diagram error: {error}
      </div>
    );
  }

  return <div ref={containerRef} className="overflow-x-auto" />;
}
