import type { Assessment, HomeContext, Indicator, Investigation, PeerResult } from "../api";
import { ClassBadge, Empty, Icon, Panel } from "./ui";

const PATTERN_LABEL: Record<string, string> = {
  ENTRY_REPEATED_FAILED_ACCESS: "Repeated failed access at an entry",
  UNKNOWN_DEVICE_AT_ENTRY: "Unrecognised device near an entry",
  ENTRY_WITHOUT_UNLOCK_AFTER_FAILURES: "Door opened without unlock after failures",
};

/** The other synthetic home's related scenario, so a judge can see the same indicator from the receiving side. */
export const COUNTERPART: Record<string, { homeId: string; scenarioId: string; label: string }> = {
  "home-a": { homeId: "home-b", scenarioId: "b-followup-probe", label: "Home B" },
  "home-b": { homeId: "home-a", scenarioId: "a-suspicious-front-door", label: "Home A" },
};

function Step({ n, title, tone, children }: { n: number; title: string; tone: "local" | "shared" | "peer" | "effect"; children: React.ReactNode }) {
  const ring = { local: "ring-slate-700", shared: "ring-emerald-800/70", peer: "ring-amber-800/70", effect: "ring-sky-800/70" }[tone];
  const dot = { local: "bg-slate-600", shared: "bg-emerald-500", peer: "bg-amber-500", effect: "bg-sky-500" }[tone];
  return (
    <li className="relative pl-7">
      <span className={`absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold text-slate-950 ${dot}`}>{n}</span>
      <div className={`rounded-lg bg-slate-950/50 p-2.5 ring-1 ${ring}`}>
        <p className="mb-1.5 text-xs font-semibold text-slate-100">{title}</p>
        {children}
      </div>
    </li>
  );
}

function IndicatorCard({ ind }: { ind: Indicator }) {
  return (
    <li className="rounded-md border border-emerald-900/60 bg-emerald-950/20 px-2 py-1.5">
      <p className="text-xs text-slate-100">{PATTERN_LABEL[ind.patternCode] ?? ind.patternCode}</p>
      <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-slate-400">
        {ind.patternCode} · device {ind.actorToken ?? "none"} · {ind.severity}/{ind.confidence} · hour {ind.observedHour}
      </p>
    </li>
  );
}

function ScoreLine({ label, a }: { label: string; a: Assessment }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-sm text-slate-100">{a.score}</span>
        <ClassBadge value={a.classification} />
      </span>
    </div>
  );
}

export function CrossHomePanel({
  peer,
  investigation,
  context,
  busy,
  onOpenCounterpart,
}: {
  peer: PeerResult | null;
  investigation: Investigation | null;
  context: HomeContext | null;
  busy: boolean;
  onOpenCounterpart: (homeId: string, scenarioId: string) => void;
}) {
  const counterpart = context ? COUNTERPART[context.home.id] : undefined;
  const openOther = counterpart && (
    <button type="button" className="btn-ghost mt-3 w-full text-xs" disabled={busy} onClick={() => onOpenCounterpart(counterpart.homeId, counterpart.scenarioId)}>
      <Icon name="home" className="h-3.5 w-3.5" /> See the receiving side: open {counterpart.label}'s scenario (synthetic)
    </button>
  );

  if (!peer || !investigation) {
    return (
      <Panel title="Cross-home evidence trail" icon={<Icon name="network" />}>
        <Empty>Not checked yet. Ask “Has another home seen a similar pattern?”</Empty>
        {openOther}
      </Panel>
    );
  }

  const hasRadio = investigation.timeline.some((e) => e.type === "network.unknown_device");
  const local = [
    `${investigation.timeline.length} raw events with exact times`,
    `presence of ${context?.members.length ?? "all"} household member(s)`,
    `${context?.devices.length ?? "all"} device names and locations`,
    "access-code labels",
    ...(hasRadio ? ["raw Bluetooth fingerprint"] : []),
  ];
  const before = peer.assessmentBeforePeer;

  return (
    <Panel
      title="Cross-home evidence trail"
      icon={<Icon name="network" />}
      id="cross-home"
      right={<span className={`chip ${peer.matches.length ? "border-amber-700/60 text-amber-300" : "border-slate-700 text-slate-400"}`}>{peer.matches.length} match{peer.matches.length === 1 ? "" : "es"}</span>}
    >
      <ol className="space-y-2.5" data-testid="cross-home-trail">
        <Step n={1} title={`Observed in ${context?.home.name ?? "this home"}: stays local`} tone="local">
          <ul className="flex flex-wrap gap-1" data-testid="kept-local">
            {local.map((l) => (
              <li key={l} className="chip border-slate-700 text-slate-300">
                <Icon name="eyeOff" className="h-3 w-3" /> {l}
              </li>
            ))}
          </ul>
        </Step>

        <Step
          n={2}
          title={`${investigation.assumptions.occupancy ? "Derived for comparison only (what-if is never published)" : "Derived and shared"}: ${peer.queried.length} compact indicator${peer.queried.length === 1 ? "" : "s"} (${peer.sharedFields.length} fields each)`}
          tone="shared"
        >
          {peer.queried.length ? (
            <ul className="space-y-1" data-testid="shared-indicators">
              {peer.queried.map((q) => (
                <IndicatorCard key={q.indicatorId} ind={q} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Nothing to share: no shareable pattern was found.</p>
          )}
          <p className="mt-1.5 text-[11px] text-slate-500">
            Device and home are keyed-hash tokens; time is rounded to the hour. {peer.publishNote}
          </p>
        </Step>

        <Step n={3} title={peer.matches.length ? "Reported by another synthetic home" : "No other home reported a match"} tone="peer">
          {peer.matches.length ? (
            <ul className="space-y-1">
              {peer.matches.map((m) => (
                <li key={m.indicator.indicatorId} className="text-xs text-slate-300">
                  <span className="font-medium text-amber-300">{m.strength}</span> · {PATTERN_LABEL[m.indicator.patternCode] ?? m.indicator.patternCode}{" "}
                  <span className="text-slate-500">(matched on {m.matchedOn.join(" + ")}, hour {m.indicator.observedHour})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Compared against {peer.peerIndicatorsVisible} peer indicator(s). Absence of a match is not evidence of safety.</p>
          )}
        </Step>

        <Step n={4} title="Effect on this assessment" tone="effect">
          <div className="space-y-1" data-testid="peer-effect">
            {before && <ScoreLine label="This home's rules alone" a={before} />}
            <ScoreLine label={`With peer intelligence (+${peer.scoreAdjustment})`} a={peer.updatedAssessment} />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-300" data-testid="peer-interpretation">
            {peer.interpretation}
          </p>
        </Step>
      </ol>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Exact records sent ({peer.queried.length}) and limitations</summary>
        <pre className="scroll-thin mt-1 max-h-48 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-400">{JSON.stringify(peer.queried, null, 2)}</pre>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-400">
          {peer.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
      {openOther}
    </Panel>
  );
}
