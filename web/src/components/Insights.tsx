import { useEffect, useRef } from "react";
import type { Assessment, Investigation, PeerResult, Proposal } from "../api";
import { ClassBadge, Empty, Icon, LEVEL_BAR, Panel, Spinner } from "./ui";

export function AssessmentPanel({ investigation, assessment }: { investigation: Investigation | null; assessment: Assessment | null }) {
  if (!investigation || !assessment) {
    return (
      <Panel title="Risk assessment" icon={<Icon name="gauge" />}>
        <Empty>No assessment yet. Ask HearthGuard to investigate.</Empty>
      </Panel>
    );
  }
  const a = assessment;
  const occ = investigation.assumptions.occupancy;
  return (
    <Panel title="Risk assessment" icon={<Icon name="gauge" />} right={<span className="font-mono text-[11px] text-slate-500">{investigation.incidentId} · rev {investigation.revision}</span>}>
      {occ && (
        <div className="mb-3 rounded-lg border border-sky-700/50 bg-sky-950/40 px-2.5 py-1.5 text-xs text-sky-200" role="note">
          What-if active: occupancy assumed <strong>{occ}</strong> for the whole window. This is a hypothesis, not recorded data.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ClassBadge value={a.classification} />
        <span className="text-xs text-slate-400">
          uncertainty <span className="font-semibold text-slate-200">{a.uncertainty.level}</span>
        </span>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums text-slate-50" data-testid="risk-score">
            {a.score}
            <span className="text-base font-normal text-slate-500">/100</span>
          </span>
          <span className="text-xs uppercase tracking-wide text-slate-400">{a.level}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.score} aria-label="Heuristic risk score">
          <div className={`h-full rounded-full transition-all duration-500 ${LEVEL_BAR[a.level]}`} style={{ width: `${a.score}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{a.scoreNote}</p>
      </div>
      {investigation.changes && (
        <p className="mt-3 rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-300 ring-1 ring-slate-800">
          Changed from revision {investigation.revision - 1}: score {investigation.changes.scoreFrom} → {investigation.changes.scoreTo}
          {investigation.changes.rulesRemoved.length > 0 && <> · removed {investigation.changes.rulesRemoved.join(", ")}</>}
          {investigation.changes.rulesAdded.length > 0 && <> · added {investigation.changes.rulesAdded.join(", ")}</>}
        </p>
      )}
      <p className="mt-3 text-sm text-slate-200">{a.summary}</p>
      {a.uncertainty.factors.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Uncertainty and limits</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-400">
            {a.uncertainty.factors.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {a.recommendedNextSteps.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Recommended next steps</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-slate-300">
            {a.recommendedNextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

export function EvidencePanel({ investigation, onHover }: { investigation: Investigation | null; onHover: (ids: string[]) => void }) {
  if (!investigation) {
    return (
      <Panel title="Evidence" icon={<Icon name="list" />}>
        <Empty>Triggered rules and the events behind them will appear here.</Empty>
      </Panel>
    );
  }
  return (
    <Panel title="Evidence" icon={<Icon name="list" />} right={<span className="text-[11px] text-slate-500">hover a card to highlight its events</span>}>
      {investigation.triggeredRules.length === 0 && investigation.mitigations.length === 0 && <Empty>No rule was triggered.</Empty>}
      <ul className="space-y-2">
        {investigation.triggeredRules.map((r) => (
          <li
            key={r.ruleId}
            tabIndex={0}
            onMouseEnter={() => onHover(r.evidenceEventIds)}
            onMouseLeave={() => onHover([])}
            onFocus={() => onHover(r.evidenceEventIds)}
            onBlur={() => onHover([])}
            className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 outline-none transition hover:border-amber-500/50 focus:border-amber-500/70"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-100">
                <span className="font-mono text-xs text-amber-400">{r.ruleId}</span> {r.name}
              </span>
              <span className="chip border-rose-800/60 font-mono text-rose-300">+{r.weight}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{r.explanation}</p>
            <p className="mt-1 font-mono text-[11px] text-slate-500">events: {r.evidenceEventIds.join(", ")}</p>
          </li>
        ))}
        {investigation.mitigations.map((m) => (
          <li key={m.id} className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-2.5" onMouseEnter={() => onHover(m.evidenceEventIds)} onMouseLeave={() => onHover([])}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-100">
                <span className="font-mono text-xs text-emerald-400">{m.id}</span> {m.name}
              </span>
              <span className="chip border-emerald-800/60 font-mono text-emerald-300">{m.weight}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{m.explanation}</p>
          </li>
        ))}
      </ul>
      {investigation.notTriggered.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Rules checked but not triggered ({investigation.notTriggered.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {investigation.notTriggered.map((n) => (
              <li key={n.ruleId} className="text-xs text-slate-400">
                <span className="font-mono text-slate-500">{n.ruleId}</span> {n.name}: {n.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Observed facts ({investigation.observedFacts.length})</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-400">
          {investigation.observedFacts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

const TYPE_ICON: Record<string, string> = {
  "lock.unlock_failed": "lock",
  "lock.unlocked": "lock",
  "lock.locked": "lock",
  "contact.opened": "door",
  "contact.closed": "door",
  "motion.detected": "motion",
  "camera.person_detected": "camera",
  "camera.offline": "camera",
  "camera.clip_unavailable": "camera",
  "presence.arrived": "home",
  "presence.departed": "home",
  "network.unknown_device": "hub",
};

export function TimelinePanel({ investigation, highlight }: { investigation: Investigation | null; highlight: string[] }) {
  if (!investigation) {
    return (
      <Panel title="Event timeline" icon={<Icon name="clock" />}>
        <Empty>The chronological event timeline appears after investigate_events runs.</Empty>
      </Panel>
    );
  }
  const hl = new Set(highlight);
  return (
    <Panel title="Event timeline" icon={<Icon name="clock" />} right={<span className="text-[11px] text-slate-500">{investigation.timeline.length} events</span>}>
      <ol className="relative space-y-0.5 border-l border-slate-800 pl-4" data-testid="timeline">
        {investigation.timeline.map((e) => {
          const flagged = e.ruleIds.length > 0;
          return (
            <li key={e.id} className={`relative rounded-md px-2 py-1.5 transition ${hl.has(e.id) ? "bg-amber-500/15 ring-1 ring-amber-500/60" : ""}`}>
              <span className={`absolute -left-[21px] top-2.5 h-2.5 w-2.5 rounded-full ring-4 ring-slate-900 ${flagged ? "bg-rose-400" : "bg-slate-600"}`} />
              <div className="flex items-start gap-2">
                <span className="w-11 shrink-0 font-mono text-xs text-slate-500">{e.localTime}</span>
                <Icon name={TYPE_ICON[e.type] ?? "info"} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className={`text-xs ${flagged ? "text-slate-100" : "text-slate-400"}`}>{e.summary}</p>
                  <p className="text-[11px] text-slate-600">
                    {e.location} · <span className="font-mono">{e.id}</span>
                    {e.ruleIds.map((r) => (
                      <span key={r} className="ml-1 font-mono text-amber-400/80">
                        {r}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function PeerPanel({ peer, homeName }: { peer: PeerResult | null; homeName?: string }) {
  if (!peer) {
    return (
      <Panel title="Cross-home intelligence" icon={<Icon name="network" />}>
        <Empty>Not checked yet. Ask “Has another home seen a similar pattern?”</Empty>
      </Panel>
    );
  }
  return (
    <Panel
      title="Cross-home intelligence"
      icon={<Icon name="network" />}
      right={<span className={`chip ${peer.matches.length ? "border-rose-700/60 text-rose-300" : "border-slate-700 text-slate-400"}`}>{peer.matches.length} match{peer.matches.length === 1 ? "" : "es"}</span>}
    >
      <p className="text-xs text-slate-400">
        Compared {peer.queried.length} indicator(s) derived from {homeName ?? "this home"} against {peer.peerIndicatorsVisible} indicator(s) shared by other synthetic homes. Score adjustment{" "}
        <span className="font-mono text-slate-200">+{peer.scoreAdjustment}</span>.
      </p>
      {peer.matches.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {peer.matches.map((m) => (
            <li key={m.indicator.indicatorId} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-200">{m.indicator.patternCode}</span>
                <span className={`chip ${m.strength === "strong" ? "border-rose-700/60 text-rose-300" : m.strength === "moderate" ? "border-amber-700/60 text-amber-300" : "border-slate-700 text-slate-400"}`}>
                  {m.strength}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                matched on {m.matchedOn.join(" + ")} · from {m.indicator.sourceHomeToken} · {m.indicator.observedHour}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
            <Icon name="eye" className="h-3 w-3" /> Shared
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-300">
            {peer.sharedFields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Icon name="eyeOff" className="h-3 w-3" /> Never shared
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
            {peer.withheldFields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Exact indicator records sent ({peer.queried.length})</summary>
        <pre className="scroll-thin mt-1 max-h-48 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-400">{JSON.stringify(peer.queried, null, 2)}</pre>
      </details>
      <p className="mt-2 text-[11px] text-slate-500">{peer.publishNote}</p>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Limitations</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
          {peer.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

const STATUS_STYLE: Record<Proposal["status"], string> = {
  pending: "border-amber-700/60 text-amber-300",
  confirmed: "border-emerald-700/60 text-emerald-300",
  cancelled: "border-slate-700 text-slate-400",
  superseded: "border-slate-700 text-slate-500",
};

export function ResponsePanel({
  proposal,
  canPropose,
  busy,
  onPropose,
  onReview,
}: {
  proposal: Proposal | null;
  canPropose: boolean;
  busy: boolean;
  onPropose: () => void;
  onReview: () => void;
}) {
  return (
    <Panel title="Protective response" icon={<Icon name="lock" />} right={proposal && <span className={`chip ${STATUS_STYLE[proposal.status]}`}>{proposal.status}</span>} id="response">
      {!proposal ? (
        <div className="space-y-2">
          <Empty>No response proposed yet.</Empty>
          <button type="button" className="btn-ghost w-full" disabled={!canPropose || busy} onClick={onPropose}>
            Prepare a response
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-slate-400">
            <span className="font-mono text-slate-300">{proposal.proposalId}</span> · {proposal.summary}
          </p>
          <ul className="mt-2 space-y-1.5">
            {proposal.actions.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                <p className="flex items-start justify-between gap-2 text-sm text-slate-100">
                  <span>{a.label}</span>
                  <span className="chip shrink-0 border-sky-800/60 text-sky-300">simulated</span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {a.rationale} <span className="font-mono">({a.basedOn.join(", ")})</span>
                </p>
              </li>
            ))}
          </ul>
          {proposal.status === "pending" && (
            <button type="button" className="btn-primary mt-3 w-full" onClick={onReview} disabled={busy}>
              Review &amp; confirm
            </button>
          )}
          {proposal.status === "superseded" && (
            <button type="button" className="btn-ghost mt-3 w-full" onClick={onPropose} disabled={busy || !canPropose}>
              Evidence changed. Prepare a new response.
            </button>
          )}
          {proposal.outcome && (
            <div className={`mt-3 rounded-lg p-2 text-xs ${proposal.status === "confirmed" ? "bg-emerald-950/40 text-emerald-200 ring-1 ring-emerald-800/60" : "bg-slate-950/60 text-slate-400 ring-1 ring-slate-800"}`} role="status">
              <p className="font-medium">
                {proposal.status === "confirmed" ? "Recorded as confirmed" : "Recorded as cancelled"}
                {proposal.decidedAt ? ` at ${new Date(proposal.decidedAt).toLocaleTimeString()}` : ""}.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {proposal.outcome.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function ConfirmDialog({
  proposal,
  busy,
  onConfirm,
  onCancelProposal,
  onClose,
}: {
  proposal: Proposal;
  busy: boolean;
  onConfirm: () => void;
  onCancelProposal: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm"
      aria-labelledby="confirm-title"
    >
      <div className="p-5">
        <h3 id="confirm-title" className="text-lg font-semibold text-slate-50">
          Confirm simulated response?
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          HearthGuard will record these actions on <span className="font-mono">{proposal.incidentId}</span>. They are <strong className="text-slate-200">simulated</strong>. No real lock, camera or
          person is contacted.
        </p>
        <ul className="mt-3 space-y-1.5">
          {proposal.actions.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>{a.label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:justify-end">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
          Not now
        </button>
        <button type="button" className="btn-danger" onClick={onCancelProposal} disabled={busy}>
          Cancel response
        </button>
        <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy} autoFocus>
          {busy ? <Spinner /> : <Icon name="check" />} Confirm &amp; record
        </button>
      </div>
    </dialog>
  );
}
