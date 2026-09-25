import { formatCompactCurrency } from "../utils/format";

function tint(color, strength) {
  return `color-mix(in srgb, ${color} ${strength}%, transparent)`;
}

export function Badge({ children, color = "var(--orange)" }) {
  return (
    <span
      className="badge"
      style={{
        background: tint(color, 14),
        color,
        border: `1px solid ${tint(color, 24)}`,
      }}
    >
      {children}
    </span>
  );
}

export function StatCard({ icon, label, value, sub, color, trend }) {
  return (
    <div className="stat">
      <div className="stat-glow" style={{ background: color }} />
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-ico" style={{ background: tint(color, 14) }}>
          {icon}
        </span>
      </div>
      <div className="stat-val">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
      {trend ? (
        <div
          className="stat-trend"
          style={{ color: trend.up ? "var(--green)" : "var(--red)" }}
        >
          {trend.up ? "↑" : "↓"} {trend.label}
        </div>
      ) : null}
    </div>
  );
}

export function SectionCard({ title, action, children, bodyClassName = "" }) {
  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-title">{title}</span>
        {action}
      </div>
      <div className={`card-bd ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}

export function ProgressBar({ value, color }) {
  return (
    <div className="pbar">
      <div className="pbar-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

export function Avatar({ label, color, size = 34 }) {
  return (
    <span
      className="avatar"
      style={{ background: color, width: size, height: size, fontSize: size / 3 }}
    >
      {label}
    </span>
  );
}

export function EmptyState({ icon, children }) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      {children}
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MiniBarChart({ data, color = "var(--orange)", dual = false }) {
  const max = Math.max(
    ...data.map((item) =>
      dual ? Math.max(item.primary || 0, item.secondary || 0) : item.value || 0,
    ),
    1,
  );

  return (
    <div className="bars" style={{ height: 200 }}>
      {data.map((item) => (
        <div key={item.label} className="bar-col">
          {dual ? (
            <div
              style={{
                display: "flex",
                gap: 4,
                alignItems: "flex-end",
                justifyContent: "center",
                height: "100%",
                width: "100%",
              }}
            >
              <div
                className="bar-v"
                style={{
                  height: `${(item.primary / max) * 100}%`,
                  background: "linear-gradient(180deg,var(--green),#2ECC8Eaa)",
                  maxWidth: 18,
                }}
              />
              <div
                className="bar-v"
                style={{
                  height: `${(item.secondary / max) * 100}%`,
                  background: "linear-gradient(180deg,var(--red),#FF5050aa)",
                  maxWidth: 18,
                }}
              />
            </div>
          ) : (
            <div
              className="bar-v"
              style={{
                height: `${((item.value || 0) / max) * 100}%`,
                background: `linear-gradient(180deg, ${color}, ${tint(color, 60)})`,
              }}
            />
          )}
          <span className="bar-lbl">{item.label}</span>
          {!dual ? <span className="bar-amt">{formatCompactCurrency(item.value)}</span> : null}
        </div>
      ))}
    </div>
  );
}
