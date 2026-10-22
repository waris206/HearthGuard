import { useCallback, useEffect, useState } from "react";
import { api, type HomeSummary, type IncidentRecord, type TurnResult } from "./api";
import { Chat, type UiMessage } from "./components/Chat";
import { CrossHomePanel } from "./components/CrossHome";
import { AssessmentPanel, ConfirmDialog, EvidencePanel, ResponsePanel, TimelinePanel } from "./components/Insights";
import { HomeOverview, IncidentHistory, ScenarioPicker } from "./components/Sidebar";
import { Icon } from "./components/ui";

const DEFAULT = { homeId: "home-a", scenarioId: "a-suspicious-front-door" };

export default function App() {
  const [homes, setHomes] = useState<HomeSummary[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [selection, setSelection] = useState<{ homeId: string; scenarioId: string } | null>(null);
  const [turn, setTurn] = useState<TurnResult | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [mcp, setMcp] = useState<TurnResult["mcp"] | null>(null);

  const refreshIncidents = useCallback(() => {
    api.incidents().then(setIncidents).catch((e) => setError(e.message));
  }, []);

  const apply = useCallback(
    (res: TurnResult) => {
      setTurn(res);
      if (res.mcp.protocolVersion) setMcp(res.mcp);
      const failed = res.steps.some((s) => !s.ok);
      setMessages((m) => [...m, { role: "assistant", text: res.reply, steps: res.steps, error: failed }]);
      refreshIncidents();
    },
    [refreshIncidents],
  );

  const select = useCallback(
    async (homeId: string, scenarioId: string) => {
      setSelection({ homeId, scenarioId });
      setMessages([]);
      setTurn(null);
      setHighlight([]);
      setError(null);
      setBusy(true);
      try {
        apply(await api.start(homeId, scenarioId));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    api
      .homes()
      .then((h) => {
        setHomes(h);
        select(DEFAULT.homeId, DEFAULT.scenarioId);
      })
      .catch((e) => setError(`Cannot reach the HearthGuard server: ${e.message}`));
  }, [select]);

  const send = async (text: string) => {
    if (!turn) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    setError(null);
    try {
      apply(await api.send(turn.conversationId, text));
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => [...m, { role: "assistant", text: `Request failed: ${(e as Error).message}. Nothing was changed.`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: "confirm" | "cancel") => {
    const p = turn?.state.proposal;
    if (!turn || !p) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.decide(turn.conversationId, p.proposalId, decision);
      // Only describe the decision as done if the backend actually recorded it.
      const recorded = res.state.proposal?.proposalId === p.proposalId && res.state.proposal.status === (decision === "confirm" ? "confirmed" : "cancelled");
      setMessages((m) => [...m, { role: "user", text: `${decision === "confirm" ? "Confirm" : "Cancel"} ${p.proposalId} (dialog)` }]);
      apply(res);
      if (recorded) setConfirmOpen(false);
      else setError(`The ${decision} was not recorded. See the reply for the reason.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset all demo incidents and the shared indicator store? Home B's seed incident will be re-derived.")) return;
    setBusy(true);
    try {
      await api.reset();
      refreshIncidents();
      if (selection) await select(selection.homeId, selection.scenarioId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const state = turn?.state;
  const investigation = state?.investigation ?? null;
  const assessment = investigation?.assessment ?? null;
  const proposal = state?.proposal ?? null;
  const canPropose = Boolean(investigation && assessment && assessment.classification !== "no_concern");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-semibold leading-tight tracking-tight text-slate-50">HearthGuard</h1>
              <p className="text-[11px] leading-tight text-slate-500">Evidence-driven smart-home investigations</p>
            </div>
          </div>
          <span className="chip border-sky-800/60 bg-sky-950/40 text-sky-300">Synthetic demo · simulated actions only</span>
          <div className="ml-auto flex items-center gap-2">
            {mcp?.protocolVersion ? (
              <span className="chip border-emerald-800/60 text-emerald-300" title="Negotiated by the assistant's MCP client with the HearthGuard MCP server">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                MCP {mcp.protocolVersion} · {mcp.server?.name} {mcp.server?.version}
              </span>
            ) : (
              <span className="chip border-slate-700 text-slate-500">MCP not connected yet</span>
            )}
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={reset} disabled={busy}>
              <Icon name="reset" className="h-3.5 w-3.5" /> Reset demo
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-[1600px] px-4 pt-3" role="alert">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-800/60 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="text-rose-300 hover:text-rose-100">
              <Icon name="x" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_minmax(0,420px)]">
        <aside className="scroll-thin space-y-4 lg:col-span-2 xl:col-span-1 xl:h-[calc(100vh-7.5rem)] xl:overflow-y-auto xl:pr-1">
          <ScenarioPicker homes={homes} homeId={selection?.homeId ?? null} scenarioId={selection?.scenarioId ?? null} busy={busy} onSelect={select} />
          <HomeOverview context={state?.context ?? null} />
          <IncidentHistory incidents={incidents} currentId={state?.incidentId ?? null} onRefresh={refreshIncidents} />
        </aside>

        <Chat messages={messages} suggestions={turn?.suggestions ?? []} busy={busy} disabled={!turn || !state?.context} onSend={send} />

        <div className="scroll-thin space-y-4 lg:h-[calc(100vh-7.5rem)] lg:overflow-y-auto lg:pr-1">
          <AssessmentPanel investigation={investigation} assessment={assessment} />
          <ResponsePanel proposal={proposal} canPropose={canPropose} busy={busy} onPropose={() => send("What should I do?")} onReview={() => setConfirmOpen(true)} />
          <CrossHomePanel peer={state?.peer ?? null} investigation={investigation} context={state?.context ?? null} busy={busy} onOpenCounterpart={select} />
          <EvidencePanel investigation={investigation} onHover={setHighlight} />
          <TimelinePanel investigation={investigation} highlight={highlight} />
        </div>
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-6 text-center text-[11px] text-slate-600">
        HearthGuard is a hackathon prototype running on synthetic households. It is not an Amazon product, is not integrated with Alexa or Echo devices, and never controls real locks,
        cameras or homes. Scores are rule-based heuristics, not probabilities.
      </footer>

      {confirmOpen && proposal && proposal.status === "pending" && (
        <ConfirmDialog proposal={proposal} busy={busy} error={error} onConfirm={() => decide("confirm")} onCancelProposal={() => decide("cancel")} onClose={() => setConfirmOpen(false)} />
      )}
    </div>
  );
}
