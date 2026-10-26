import { useEffect, useRef, useState } from 'react';
import { aggregate, datesBetween, format } from '../lib/metrics.js';
const series = [
  { key: 'spend', name: 'Chi tiêu', color: '#9a9dff', type: 'money' },
  { key: 'ROAS', name: 'ROAS', color: '#5cceb1', type: 'ratio' },
  { key: 'conversions', name: 'Chuyển đổi', color: '#7e9fd4', type: 'number' },
];
function curve(points) {
  if (points.length === 1) return `M${points[0][0]},${points[0][1]} l1,0`;
  return points
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = points[i - 1],
        mid = (px + x) / 2;
      return `C${mid},${py} ${mid},${y} ${x},${y}`;
    })
    .join(' ');
}
export default function Chart({ rows, range }) {
  const svgRef = useRef(null);
  const [width, setWidth] = useState(880);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const [visible, setVisible] = useState(['spend', 'ROAS', 'conversions']);
  const [hover, setHover] = useState(null);
  const data = datesBetween(range.since, range.until).map((date) => ({
    date,
    ...aggregate(rows.filter((r) => r.date === date)),
  }));
  const w = width,
    h = 230,
    pad = 18,
    top = 12,
    bottom = 35;
  const labelCount = Math.max(2, Math.min(7, Math.floor(w / 72)));
  const max = Object.fromEntries(
    series.map((s) => [s.key, Math.max(1, ...data.map((d) => Number(d[s.key]) || 0)) * 1.15]),
  );
  const x = (i) => (data.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (data.length - 1));
  const y = (v, key) => h - bottom - ((Number(v) || 0) / max[key]) * (h - top - bottom);
  return (
    <>
      <div className="chart-legend">
        {series.map((s) => (
          <button
            key={s.key}
            className={!visible.includes(s.key) ? 'off' : ''}
            aria-pressed={visible.includes(s.key)}
            onClick={() =>
              setVisible((v) => (v.includes(s.key) ? v.filter((k) => k !== s.key) : [...v, s.key]))
            }
          >
            <i style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
        <span>Thang đo tương đối · rê chuột để xem giá trị</span>
      </div>
      <div className="chart-wrap">
        <div className="chart-y">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0</span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={`Biểu đồ chi tiêu, ROAS và chuyển đổi từ ${range.since} đến ${range.until}`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="spendArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#888cff" stopOpacity=".15" />
              <stop offset="100%" stopColor="#888cff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <line
              key={v}
              x1="0"
              x2={w}
              y1={top + v * (h - top - bottom)}
              y2={top + v * (h - top - bottom)}
              stroke="#27303c"
              strokeDasharray="3 5"
            />
          ))}
          {series
            .filter((s) => visible.includes(s.key))
            .map((s) => {
              const points = data.map((d, i) => [x(i), y(d[s.key], s.key)]);
              return (
                <g key={s.key}>
                  {s.key === 'spend' && (
                    <path
                      d={`${curve(points)} L${x(data.length - 1)},${h - bottom} L${x(0)},${h - bottom} Z`}
                      fill="url(#spendArea)"
                    />
                  )}
                  <path
                    d={curve(points)}
                    stroke={s.color}
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    fill="none"
                  />
                  {data.length === 1 && (
                    <circle cx={x(0)} cy={y(data[0][s.key], s.key)} r="4" fill={s.color} />
                  )}
                </g>
              );
            })}
          {data.map((d, i) => (
            <g key={d.date}>
              {(data.length <= labelCount ||
                i % Math.ceil((data.length - 1) / (labelCount - 1)) === 0 ||
                i === data.length - 1) && (
                <text x={x(i)} y={h - 6} textAnchor="middle" fill="#a2aec1" fontSize="13">
                  {d.date.slice(8)}/{d.date.slice(5, 7)}
                </text>
              )}
              <rect
                tabIndex={0}
                aria-label={`${d.date}: chi tiêu ${format(d.spend, 'money')}, ROAS ${format(d.ROAS, 'ratio')}, ${d.conversions} chuyển đổi`}
                x={x(i) - w / data.length / 2}
                y="0"
                width={w / data.length}
                height={h - bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
              />
            </g>
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={top}
                y2={h - bottom}
                stroke="#65718a"
                strokeDasharray="3 3"
              />
              {series
                .filter((s) => visible.includes(s.key))
                .map((s) => (
                  <circle
                    key={s.key}
                    cx={x(hover)}
                    cy={y(data[hover][s.key], s.key)}
                    r="4"
                    fill={s.color}
                    stroke="#121820"
                    strokeWidth="3"
                  />
                ))}
            </g>
          )}
        </svg>
        {hover != null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${Math.min(75, Math.max(9, (hover / Math.max(1, data.length - 1)) * 83))}%`,
            }}
          >
            <b>{data[hover].date.split('-').reverse().join('/')}</b>
            {series.map((s) => (
              <div key={s.key}>
                <i style={{ background: s.color }} />
                {s.name}
                <strong>{format(data[hover][s.key], s.type)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
