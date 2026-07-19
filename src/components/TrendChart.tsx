import { fmtDate } from "@/lib/dashboard-data";

// --------------- Trend chart -----------------------------------------

const W = 720, H = 220, PAD_L = 34, PAD_R = 12, PAD_T = 14, PAD_B = 30;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

export function TrendChart({ pts }: { pts: { date: string; total: number }[] }) {
  const n = pts.length;
  if (n === 0) return null;

  const maxVal = Math.max(...pts.map((p) => p.total), 1);
  const niceMax = Math.ceil(maxVal / 5) * 5 || 5;
  const bw = (INNER_W / n) * 0.58;
  const gap = INNER_W / n;

  const firstPt = pts[0];
  const lastPt = pts[n - 1];
  const first = firstPt?.total ?? 0;
  const last = lastPt?.total ?? 0;
  const delta = last - first;

  const cap =
    delta < 0
      ? `Down ${Math.abs(delta)} since the first run — regressions are trending the right way.`
      : delta > 0
      ? `Up ${delta} since the first run — worth a look.`
      : "Holding steady across runs.";

  const firstDate = firstPt ? fmtDate(firstPt.date) : "";
  const lastDate = lastPt ? fmtDate(lastPt.date) : "";
  const dir = delta < 0 ? "down" : delta > 0 ? "up" : "level";
  const ariaLabel = `Bar chart of total violations per audit run, from ${first} on ${firstDate} to ${last} on ${lastDate} — trending ${dir} by ${Math.abs(delta)}.`;

  return (
    <div className="trend">
      <svg
        className="trend__chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Grid lines */}
        {Array.from({ length: 5 }, (_, g) => {
          const gy = PAD_T + INNER_H - (INNER_H * g) / 4;
          const gv = Math.round((niceMax * g) / 4);
          return (
            <g key={g}>
              <line className="trend__grid" x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} />
              <text className="trend__axis" x={PAD_L - 6} y={gy + 4} textAnchor="end">
                {gv}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {pts.map((p, i) => {
          const x = PAD_L + gap * i + (gap - bw) / 2;
          const h = INNER_H * (p.total / niceMax);
          const y = PAD_T + INNER_H - h;
          const isLast = i === n - 1;
          return (
            <rect
              key={p.date}
              className={`trend__bar${isLast ? " trend__bar--last" : ""}`}
              x={x}
              y={y}
              width={bw}
              height={Math.max(h, 1)}
              rx={3}
            >
              <title>{`${fmtDate(p.date)}: ${p.total} violations`}</title>
            </rect>
          );
        })}

        {/* X-axis labels */}
        {pts.map((p, i) => {
          const x = PAD_L + gap * i + (gap - bw) / 2 + bw / 2;
          return (
            <text key={`xl-${i}`} className="trend__axis" x={x} y={H - 10} textAnchor="middle">
              {fmtDate(p.date)}
            </text>
          );
        })}
      </svg>

      {/* Screen-reader table */}
      <table className="visually-hidden">
        <caption>Violations per audit run</caption>
        <thead>
          <tr>
            <th scope="col">Run date</th>
            <th scope="col">Total violations</th>
          </tr>
        </thead>
        <tbody>
          {pts.map((p) => (
            <tr key={p.date}>
              <td>{fmtDate(p.date)}</td>
              <td>{p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="trend__cap">{cap}</p>
    </div>
  );
}
