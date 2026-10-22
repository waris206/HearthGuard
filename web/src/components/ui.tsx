import { Fragment, type ReactNode } from "react";
import type { Classification, Level } from "../api";

export const CLASS_META: Record<Classification, { label: string; cls: string; dot: string }> = {
  no_concern: { label: "No concern", cls: "border-emerald-700/60 bg-emerald-950/60 text-emerald-300", dot: "bg-emerald-400" },
  inconclusive: { label: "Inconclusive", cls: "border-amber-700/60 bg-amber-950/60 text-amber-300", dot: "bg-amber-400" },
  likely_security_concern: { label: "Likely security concern", cls: "border-rose-700/60 bg-rose-950/60 text-rose-300", dot: "bg-rose-400" },
};

export const LEVEL_BAR: Record<Level, string> = {
  low: "bg-emerald-400",
  elevated: "bg-amber-400",
  high: "bg-rose-500",
};

export function ClassBadge({ value }: { value: Classification }) {
  const m = CLASS_META[value];
  return (
    <span className={`chip ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function Panel({ title, icon, children, right, id }: { title: string; icon?: ReactNode; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section className="panel p-4" id={id} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="panel-title">
          {icon}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">{children}</p>;
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

const paths: Record<string, string> = {
  shield: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z",
  home: "M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V11z",
  clock: "M12 7v5l3 3M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  network: "M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 23a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 23a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 5v7m0 0-7 7m7-7 7 7",
  bolt: "M13 2 3 14h8l-1 8 10-12h-8l1-8z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z",
  gauge: "M12 14l4-4M3.3 17a10 10 0 1 1 17.4 0",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  door: "M5 21V3h11l3 2v16M13 12h.01M3 21h18",
  motion: "M13 4a2 2 0 1 0 0-4M7 22l3-7 3 2v5m-6-9 2-5 4 1 3 4 3 1",
  camera: "M23 7l-7 5 7 5V7zM1 5h15v14H1z",
  hub: "M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  history: "M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8",
  info: "M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  reset: "M1 4v6h6M3.5 15a9 9 0 1 0 2.1-9.4L1 10",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M1 1l22 22",
};

export function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? paths.info} />
    </svg>
  );
}

export function deviceIcon(kind: string) {
  return ({ lock: "lock", contact: "door", motion: "motion", camera: "camera", hub: "hub" } as Record<string, string>)[kind] ?? "info";
}

/** Tiny, safe Markdown subset renderer: paragraphs, "- " lists, **bold**, _italic_. No HTML injection. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const out: ReactNode[] = [];
        let list: string[] = [];
        const flush = (key: string) => {
          if (list.length) {
            out.push(
              <ul key={key} className="ml-4 list-disc space-y-1 marker:text-slate-600">
                {list.map((l, i) => (
                  <li key={i}>{inline(l)}</li>
                ))}
              </ul>,
            );
            list = [];
          }
        };
        lines.forEach((line, li) => {
          if (line.startsWith("- ")) list.push(line.slice(2));
          else {
            flush(`l${li}`);
            out.push(<p key={li}>{inline(line)}</p>);
          }
        });
        flush("end");
        return <Fragment key={bi}>{out}</Fragment>;
      })}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(\*\*[^*]+\*\*|(?<!\w)_[^_]+_(?!\w))/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-slate-50">{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i} className="text-slate-400">{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
