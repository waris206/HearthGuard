import { useEffect, useRef, useState } from "react";
import type { ToolStep } from "../api";
import { Icon, Markdown, Spinner } from "./ui";

export interface UiMessage {
  role: "user" | "assistant";
  text: string;
  steps?: ToolStep[];
  error?: boolean;
}

export function Chat({
  messages,
  suggestions,
  busy,
  disabled,
  onSend,
}: {
  messages: UiMessage[];
  suggestions: string[];
  busy: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages.length, busy]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    onSend(t);
    setDraft("");
  };

  return (
    <section className="panel flex min-h-[520px] flex-col lg:h-[calc(100vh-7.5rem)]" aria-label="Investigation conversation">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="panel-title">
          <Icon name="chat" /> Investigation
        </h2>
        <span className="text-[11px] text-slate-500">Deterministic assistant · every step is a real MCP tool call</span>
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4" data-testid="chat-log">
        {messages.length === 0 && !busy && (
          <div className="mx-auto max-w-md py-10 text-center text-sm text-slate-500">
            Pick a synthetic home and scenario on the left, then ask HearthGuard to investigate.
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} m={m} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-400" role="status">
            <Spinner /> Calling HearthGuard MCP tools…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-800 p-3">
        {suggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Suggested follow-up questions">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || disabled}
                onClick={() => submit(s)}
                className="max-w-full truncate rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-left text-xs text-slate-300 transition hover:border-amber-500/60 hover:text-amber-200 disabled:opacity-40"
                title={s}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Ask HearthGuard
          </label>
          <input
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={disabled}
            maxLength={1000}
            placeholder={disabled ? "Select a scenario to begin" : "Ask about the activity, e.g. “What if the owner was actually home?”"}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
          <button type="submit" className="btn-primary" disabled={busy || disabled || !draft.trim()} aria-label="Send">
            <Icon name="send" />
          </button>
        </form>
      </div>
    </section>
  );
}

function Message({ m }: { m: UiMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500/15 px-3.5 py-2 text-sm text-amber-50 ring-1 ring-amber-500/30">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-amber-400">
        <Icon name="shield" className="h-4 w-4" />
      </div>
      <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm leading-relaxed ring-1 ${m.error ? "bg-rose-950/40 ring-rose-800/60" : "bg-slate-800/50 ring-slate-700/60"}`}>
        <Markdown text={m.text} />
        {m.steps && m.steps.length > 0 && <Steps steps={m.steps} />}
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: ToolStep[] }) {
  const [open, setOpen] = useState(false);
  const failed = steps.filter((s) => !s.ok).length;
  return (
    <div className="mt-3 border-t border-slate-700/60 pt-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200" aria-expanded={open}>
        <Icon name="bolt" className="h-3.5 w-3.5 text-amber-400" />
        {steps.length} MCP tool call{steps.length > 1 ? "s" : ""}
        {failed > 0 && <span className="text-rose-300">· {failed} failed</span>}
        <span className="text-slate-600">{open ? "hide" : "show"}</span>
      </button>
      {!open && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {steps.map((s, i) => (
            <span key={i} className={`chip font-mono ${s.ok ? "border-slate-700 text-slate-300" : "border-rose-700 text-rose-300"}`}>
              {s.tool} · {s.durationMs}ms
            </span>
          ))}
        </div>
      )}
      {open && (
        <ol className="mt-2 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="rounded-lg bg-slate-950/70 p-2 ring-1 ring-slate-800">
              <div className="flex items-center justify-between gap-2 font-mono text-xs">
                <span className={s.ok ? "text-emerald-300" : "text-rose-300"}>
                  {i + 1}. tools/call {s.tool}
                </span>
                <span className="text-slate-500">{s.durationMs} ms</span>
              </div>
              <pre className="scroll-thin mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-400">args {JSON.stringify(s.arguments)}</pre>
              {s.error && <p className="mt-1 font-mono text-[11px] text-rose-300">{s.error.code}: {s.error.message}</p>}
              {s.result && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">structuredContent</summary>
                  <pre className="scroll-thin mt-1 max-h-64 overflow-auto font-mono text-[11px] text-slate-400">{JSON.stringify(s.result, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
