import { useState } from "react";
import type { HomeContext, HomeSummary, IncidentRecord } from "../api";
import { ClassBadge, deviceIcon, Empty, Icon, Panel } from "./ui";

const EXPECTED_STYLE: Record<string, string> = {
  normal: "text-emerald-300",
  suspicious: "text-rose-300",
  ambiguous: "text-amber-300",
};

export function ScenarioPicker({
  homes,
  homeId,
  scenarioId,
  busy,
  onSelect,
}: {
  homes: HomeSummary[];
  homeId: string | null;
  scenarioId: string | null;
  busy: boolean;
  onSelect: (homeId: string, scenarioId: string) => void;
}) {
  return (
    <Panel title="Synthetic homes" icon={<Icon name="home" />}>
      {homes.length === 0 && <Empty>Loading homes…</Empty>}
      <div className="space-y-4">
        {homes.map((h) => (
          <div key={h.id}>
            <p className="mb-1.5 text-sm font-medium text-slate-200">{h.name}</p>
            <ul className="space-y-1">
              {h.scenarios.map((s) => {
                const active = h.id === homeId && s.id === scenarioId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSelect(h.id, s.id)}
                      aria-pressed={active}
                      className={`w-full rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-60 ${
                        active ? "border-amber-500/70 bg-amber-500/10" : "border-slate-800 hover:border-slate-600 hover:bg-slate-800/50"
                      }`}
                    >
                      <span className="block text-sm text-slate-100">{s.title}</span>
                      <span className={`text-[11px] ${EXPECTED_STYLE[s.expected]}`}>demo fixture: {s.expected}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function HomeOverview({ context }: { context: HomeContext | null }) {
  if (!context) {
    return (
      <Panel title="Home overview" icon={<Icon name="shield" />}>
        <Empty>Select a scenario to load the home's context via get_home_context.</Empty>
      </Panel>
    );
  }
  const sc = context.activeScenario;
  return (
    <Panel title="Home overview" icon={<Icon name="shield" />}>
      {sc && (
        <div className="mb-3 rounded-lg bg-slate-950/60 p-2.5 ring-1 ring-slate-800">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Window</p>
          <p className="text-sm text-slate-200">
            {sc.window.start.slice(0, 10)} · {sc.window.start.slice(11, 16)}–{sc.window.end.slice(11, 16)} <span className="text-slate-500">({context.home.timezone})</span>
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">Occupancy at start</p>
          <ul className="mt-1 space-y-0.5">
            {sc.occupancy.members.map((m) => (
              <li key={m.memberId} className="flex items-center justify-between text-sm">
                <span>{m.label}</span>
                <span className={`chip whitespace-nowrap ${m.presence === "home" ? "border-emerald-700/60 text-emerald-300" : "border-slate-700 text-slate-400"}`}>
                  {m.presence} since {m.since.slice(11, 16)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Devices ({context.devices.length})</p>
      <ul className="space-y-1">
        {context.devices.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-sm text-slate-300">
            <Icon name={deviceIcon(d.kind)} className="h-3.5 w-3.5 text-slate-500" />
            <span className="truncate">{d.name}</span>
            {d.entry && <span className="chip ml-auto border-slate-700 text-slate-500">entry</span>}
          </li>
        ))}
      </ul>
      <p className="mb-1 mt-3 text-[11px] uppercase tracking-wide text-slate-500">Access codes</p>
      <ul className="space-y-0.5 text-sm text-slate-400">
        {context.settings.accessCodes.map((c) => (
          <li key={c.label} className="flex justify-between gap-2">
            <span className="font-mono text-xs">{c.label}</span>
            <span className="text-xs">{c.schedule ? `scheduled ${c.schedule}` : c.kind}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Indicator sharing: {context.settings.shareIndicators ? "on (compact indicators only)" : "off"}</p>
    </Panel>
  );
}

const KIND_LABEL: Record<string, string> = {
  investigation: "Investigation",
  peer_check: "Peer check",
  proposal: "Proposal",
  response_confirmed: "Confirmed",
  response_cancelled: "Cancelled",
  seed: "Seed",
};

export function IncidentHistory({ incidents, currentId, onRefresh }: { incidents: IncidentRecord[]; currentId: string | null; onRefresh: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel
      title="Incident history"
      icon={<Icon name="history" />}
      right={
        <button type="button" onClick={onRefresh} className="text-xs text-slate-500 hover:text-slate-200">
          Refresh
        </button>
      }
    >
      {incidents.length === 0 ? (
        <Empty>No incidents recorded yet.</Empty>
      ) : (
        <ul className="space-y-1.5" data-testid="incident-history">
          {incidents.map((i) => {
            const latest = i.revisions[i.revisions.length - 1];
            const expanded = open === i.incidentId;
            return (
              <li key={i.incidentId} className={`rounded-lg border ${i.incidentId === currentId ? "border-amber-500/50" : "border-slate-800"}`}>
                <button type="button" className="w-full px-2.5 py-2 text-left" onClick={() => setOpen(expanded ? null : i.incidentId)} aria-expanded={expanded}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-400">{i.incidentId}</span>
                    <ClassBadge value={latest.assessment.classification} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-200">{i.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {i.homeId} · {i.revisions.length} revision{i.revisions.length > 1 ? "s" : ""} · {i.proposals.filter((p) => p.status === "confirmed").length} confirmed response
                  </p>
                </button>
                {expanded && (
                  <ol className="space-y-1 border-t border-slate-800 px-2.5 py-2">
                    {i.history.map((h, k) => (
                      <li key={k} className="text-xs text-slate-400">
                        <span className="text-slate-500">{new Date(h.at).toLocaleTimeString()}</span> <span className="font-medium text-slate-300">{KIND_LABEL[h.kind] ?? h.kind}:</span> {h.detail}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
