import { useState } from "react";
import {
  createMonitor,
  removeMonitor,
  toggleMonitor,
  type MonitorRow,
} from "@/lib/monitor-fns";
import { fmtDateTime, relTime } from "@/lib/dashboard-data";

// The /monitors page: add a URL, pause/resume it, remove it. Results of a run
// land in the ordinary audit tables, so this page owns scheduling state only —
// the findings themselves show up on the dashboard.
export function MonitorsClient({
  initialMonitors,
  maxMonitors,
}: {
  initialMonitors: MonitorRow[];
  maxMonitors: number;
}) {
  const [monitors, setMonitors] = useState<MonitorRow[]>(initialMonitors);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atCap = monitors.length >= maxMonitors;

  // Every mutation returns the server's own list, so the table follows the
  // database rather than a locally patched copy.
  async function run(action: () => Promise<{ monitors: MonitorRow[] }>, fallback: string) {
    setError(null);
    setPending(true);
    try {
      const { monitors: next } = await action();
      setMonitors(next);
      return true;
    } catch (e) {
      // addMonitor's messages name the actual problem ("already monitoring",
      // "up to 10 pages"), which a generic string would throw away.
      setError(e instanceof Error && e.message ? e.message : fallback);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(
      () => createMonitor({ data: url }),
      "Couldn't add that page. Please try again.",
    );
    if (ok) setUrl("");
  }

  return (
    <div className="wrap app-main app-main--enter">
      <div className="app-head">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h1>Pages Mend checks for you</h1>
          <p className="app-head__meta">
            Each monitored page is audited once a day, at a time we pick. Results
            appear on your dashboard alongside your extension audits.
          </p>
        </div>
      </div>

      <section className="panel" aria-labelledby="add-h">
        <div className="panel__head">
          <h2 id="add-h">Add a page</h2>
          <span className="hint">
            {monitors.length} of {maxMonitors} monitored
          </span>
        </div>
        <div className="panel__body">
          {error && (
            <p role="alert" style={{ color: "var(--sev-critical)", fontWeight: 600 }}>
              {error}
            </p>
          )}
          <form onSubmit={onAdd}>
            <div className="field" style={{ maxWidth: "34rem" }}>
              <label htmlFor="monitor-url">Page URL</label>
              <input
                id="monitor-url"
                className="input"
                type="url"
                inputMode="url"
                placeholder="https://example.com/pricing"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
            <button
              className="btn btn--primary"
              type="submit"
              disabled={pending || atCap || url.trim().length === 0}
            >
              {pending ? "Saving…" : "Track this page"}
            </button>
            {atCap && (
              <p className="muted" style={{ margin: ".6rem 0 0" }}>
                You&apos;re monitoring the maximum of {maxMonitors} pages. Remove
                one to add another.
              </p>
            )}
          </form>
        </div>
      </section>

      <section className="panel" aria-labelledby="monitors-h" style={{ marginTop: "1.4rem" }}>
        <div className="panel__head">
          <h2 id="monitors-h">Monitored pages</h2>
          <span className="hint">
            {monitors.length} {monitors.length === 1 ? "page" : "pages"}
          </span>
        </div>
        {monitors.length === 0 ? (
          <div className="panel__body">
            <p className="muted" style={{ margin: 0, maxWidth: "60ch" }}>
              Add a page and Mend will audit it once a day. Results land on your
              dashboard alongside your extension audits.
            </p>
          </div>
        ) : (
          <div className="panel__body--flush table-scroll">
            <table className="data">
              <caption className="visually-hidden">
                Pages Mend monitors daily, with the status of the last run and
                controls to pause or remove each one.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last run</th>
                  <th scope="col">Next run</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="url">{m.url}</span>
                    </td>
                    <td>
                      <MonitorStatus monitor={m} />
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {m.lastRunAt ? (
                        <span title={fmtDateTime(m.lastRunAt)}>
                          {relTime(m.lastRunAt)}
                        </span>
                      ) : (
                        <span className="muted">Not yet</span>
                      )}
                    </td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {nextRunLabel(m)}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                        <button
                          className="btn btn--ghost"
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                toggleMonitor({
                                  data: { id: m.id, paused: m.pausedAt === null },
                                }),
                              "Couldn't update that page. Please try again.",
                            )
                          }
                        >
                          {m.pausedAt ? "Resume" : "Pause"}
                        </button>
                        <RemoveButton
                          monitor={m}
                          pending={pending}
                          onConfirm={() =>
                            run(
                              () => removeMonitor({ data: m.id }),
                              "Couldn't remove that page. Please try again.",
                            )
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MonitorStatus({ monitor }: { monitor: MonitorRow }) {
  if (monitor.pausedAt) return <span className="muted">Paused</span>;
  if (monitor.lastError) {
    return (
      <span style={{ color: "var(--sev-critical)", fontWeight: 600 }}>
        Error <span style={{ fontWeight: 400 }}>· {monitor.lastError}</span>
      </span>
    );
  }
  // Until the scheduler (plan 045) runs, every new monitor sits here. That is
  // honest — nothing has run yet — so there is no fake progress to show.
  if (!monitor.lastRunAt) return <span className="muted">Scheduled</span>;
  return <span>OK</span>;
}

// The run time is randomised on purpose, so the copy stays deliberately vague:
// naming a clock time would turn our load-spreading into a promise we'd have
// to keep.
function nextRunLabel(monitor: MonitorRow): string {
  if (monitor.pausedAt) return "—";
  const due = new Date(monitor.nextRunAt).getTime();
  if (due - Date.now() <= 24 * 60 * 60 * 1000) return "Within 24 hours";
  return "Sometime tomorrow";
}

// Two-step confirm, matching the key-revoke pattern on the account page: no
// accidental one-tap removal and no browser confirm() dialog.
function RemoveButton({
  monitor,
  pending,
  onConfirm,
}: {
  monitor: MonitorRow;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        className="btn btn--ghost"
        type="button"
        disabled={pending}
        onClick={() => setArmed(true)}
      >
        Remove
      </button>
    );
  }
  return (
    <>
      <button
        className="btn btn--danger"
        type="button"
        disabled={pending}
        onClick={onConfirm}
        aria-label={`Confirm removing ${monitor.url}`}
      >
        Click again to confirm
      </button>
      <button
        className="btn btn--ghost"
        type="button"
        disabled={pending}
        onClick={() => setArmed(false)}
      >
        Cancel
      </button>
    </>
  );
}
