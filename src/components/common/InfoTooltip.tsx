import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { useSearchParams } from "react-router-dom";

// Short, plain-language definitions for the jargon used across the app. The
// `learn` key deep-links into the Methodology modal (App reads ?learn=<key>).
export const GLOSSARY: Record<string, { title: string; body: string }> = {
  tfdr: {
    title: "TFDR",
    body: "Tactical Fixture Difficulty Rating — our fixture difficulty score, adjusted for each team's attacking and defensive strength rather than a flat 1–5 scale.",
  },
  valueScore: {
    title: "Value Score",
    body: "A points-per-million style rating that blends expected output, reliability and upcoming fixtures into one comparable number. Higher is better.",
  },
  archetype: {
    title: "Archetype",
    body: "A player's statistical profile (e.g. Nailed Starter, Explosive, Rotation Risk), derived from minutes, returns and consistency across recent gameweeks.",
  },
  reliability: {
    title: "Reliability",
    body: "How dependable a player's returns have been — high reliability means steady, predictable points; low means boom-or-bust.",
  },
};

type GlossaryKey = keyof typeof GLOSSARY;

interface InfoTooltipProps {
  term: GlossaryKey;
  /** Optional visual size of the icon. */
  size?: number;
  className?: string;
}

export const InfoTooltip = ({ term, size = 12, className = "" }: InfoTooltipProps) => {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openMethodology = () => {
    setOpen(false);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("learn", term);
      return next;
    });
  };

  return (
    <span ref={wrapRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onMouseEnter={() => setOpen(true)}
        className="opacity-40 hover:opacity-100 transition-opacity"
        aria-label={`What is ${entry.title}?`}
      >
        <Info size={size} />
      </button>
      {open && (
        <span
          role="tooltip"
          onMouseLeave={() => setOpen(false)}
          className="absolute left-1/2 top-full z-[70] mt-2 w-64 -translate-x-1/2 border border-ink bg-paper/90 backdrop-blur-md p-3 text-left shadow-lg"
        >
          <span className="block font-mono text-[9px] uppercase tracking-[0.2em] opacity-50 mb-1">{entry.title}</span>
          <span className="block font-sans text-xs leading-relaxed normal-case tracking-normal text-ink">{entry.body}</span>
          <button
            type="button"
            onClick={openMethodology}
            className="mt-2 inline-block font-mono text-[9px] uppercase tracking-widest underline opacity-60 hover:opacity-100"
          >
            Full methodology →
          </button>
        </span>
      )}
    </span>
  );
};
