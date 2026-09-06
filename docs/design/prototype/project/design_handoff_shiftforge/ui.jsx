/* ShiftForge UI kit — reusable primitives shared by every surface.
   All components export to window at the bottom. */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const cx = (...a) => a.filter(Boolean).join(" ");

/* ---------- tiny atoms ---------- */
function Kbd({ children }) {
  return <kbd className="ml-auto pl-3 font-mono text-2xs text-faint">{children}</kbd>;
}
function KeyHint({ children }) {
  return <span className="font-mono text-2xs text-faint border border-bd px-1 leading-4 rounded-[2px]">{children}</span>;
}

const TONES = {
  ok:      { color: "var(--st-ok)",   background: "var(--st-ok-bg)",   borderColor: "var(--st-ok)" },
  warn:    { color: "var(--st-warn)", background: "var(--st-warn-bg)", borderColor: "var(--st-warn)" },
  crit:    { color: "var(--st-crit)", background: "var(--st-crit-bg)", borderColor: "var(--st-crit)" },
  prop:    { color: "var(--st-prop)", background: "var(--st-prop-bg)", borderColor: "var(--st-prop)" },
  sel:     { color: "var(--sel)",     background: "var(--sel-bg)",     borderColor: "var(--sel)" },
  neutral: { color: "var(--text-dim)", background: "var(--surface-2)", borderColor: "var(--border-strong)" },
};
function Badge({ tone = "neutral", children, className, title }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 px-1.5 h-[15px] text-2xs font-medium border rounded-[2px] whitespace-nowrap leading-none", className)}
      style={{ ...TONES[tone], borderColor: "color-mix(in oklab, " + TONES[tone].borderColor + " 45%, transparent)" }}>
      {children}
    </span>
  );
}
function Dot({ tone = "neutral", blink }) {
  return <span className={cx("inline-block w-1.5 h-1.5 shrink-0", blink && "sf-blink")} style={{ background: TONES[tone].color }}></span>;
}
function ShiftChip({ code, time, name }) {
  if (!code) return <span className="text-faint text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className="inline-flex items-center justify-center w-4 h-4 text-2xs font-semibold border"
        style={{ background: "var(--sh-" + code + "-bg)", color: "var(--sh-" + code + "-fg)", borderColor: "var(--sh-" + code + "-bd)" }}>{code}</span>
      <span>{name || SF.shift(code).name}</span>
      {time && <span className="text-faint">{SF.shiftTime(code)}</span>}
    </span>
  );
}

/* ---------- buttons + controls ---------- */
function Btn({ variant = "default", pressed, disabled, onClick, children, kbd, title, className, size }) {
  const base = "inline-flex items-center gap-1.5 px-2 text-xs font-medium border rounded-[2px] select-none whitespace-nowrap leading-none";
  const v = {
    default: cx("bg-raised border-bds text-ink", !disabled && "hover:bg-surface-2 active:bg-surface2"),
    primary: "text-[var(--text-inv)] border-transparent " + (disabled ? "" : "hover:opacity-90"),
    ghost:   cx("border-transparent text-dim", !disabled && "hover:bg-surface-2 hover:text-ink"),
    danger:  cx("border-transparent text-[var(--st-crit)]", !disabled && "hover:bg-[var(--st-crit-bg)]"),
  }[variant];
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} aria-pressed={pressed}
      className={cx(base, v, pressed && "!bg-[var(--sel-bg)] !border-[var(--sel)] !text-[var(--sel)]", disabled && "opacity-40 cursor-not-allowed", className)}
      style={{ height: size === "lg" ? "30px" : "var(--ctl-h)", background: variant === "primary" ? "var(--ink-solid)" : undefined }}>
      {children}
      {kbd && <KeyHint>{kbd}</KeyHint>}
    </button>
  );
}

function Seg({ value, options, onChange, className }) {
  return (
    <div className={cx("inline-flex border border-bds rounded-[2px] overflow-hidden", className)} role="tablist" style={{ height: "var(--ctl-h)" }}>
      {options.map((o, i) => (
        <button key={o.v} type="button" role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)}
          className={cx("px-2 text-xs font-medium flex items-center gap-1.5", i > 0 && "border-l border-bds",
            value === o.v ? "bg-surface text-ink font-semibold" : "bg-raised text-dim hover:text-ink")}>
          {o.label}
          {o.kbd && <KeyHint>{o.kbd}</KeyHint>}
        </button>
      ))}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, className, mono, type = "text" }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    className={cx("border border-bds bg-surface px-1.5 text-xs rounded-[2px] min-w-0", mono && "font-mono", className)} style={{ height: "var(--ctl-h)" }} />;
}
function NumInput({ value, onChange, min, max, className, w = "w-14" }) {
  return <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))}
    className={cx("border border-bds bg-surface px-1.5 text-xs font-mono text-right rounded-[2px]", w, className)} style={{ height: "var(--ctl-h)" }} />;
}
function SelectBox({ value, onChange, options, className }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={cx("border border-bds bg-raised px-1 text-xs rounded-[2px] cursor-pointer", className)} style={{ height: "var(--ctl-h)" }}>
      {options.map((o) => <option key={o.v} value={o.v} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}
function Check({ checked, onChange, label, disabled }) {
  return (
    <label className={cx("inline-flex items-center gap-1.5 text-xs select-none", disabled ? "opacity-40" : "cursor-pointer")}>
      <span onClick={() => !disabled && onChange(!checked)}
        className={cx("inline-flex items-center justify-center w-3.5 h-3.5 border rounded-[2px] text-2xs leading-none",
          checked ? "bg-[var(--ink-solid)] text-[var(--text-inv)] border-transparent" : "bg-surface border-bds")}>
        {checked ? "✓" : ""}
      </span>
      {label && <span onClick={() => !disabled && onChange(!checked)}>{label}</span>}
    </label>
  );
}
function Field({ label, hint, children, row }) {
  return (
    <div className={cx(row ? "flex items-center gap-2" : "flex flex-col gap-1")}>
      <label className={cx("text-2xs font-semibold uppercase tracking-wider text-dim", row && "w-40 shrink-0")}>{label}</label>
      {children}
      {hint && <p className="text-2xs text-faint leading-snug w-full">{hint}</p>}
    </div>
  );
}

/* ---------- containers ---------- */
function Panel({ title, actions, children, className, pad = true, tone }) {
  return (
    <section className={cx("border bg-surface rounded-[2px] flex flex-col min-w-0", className)}
      style={{ borderColor: tone ? TONES[tone].borderColor : "var(--border)" }}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-2 h-7 border-b border-bd bg-raised shrink-0">
          <h3 className="text-2xs font-semibold uppercase tracking-wider text-dim truncate">{title}</h3>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cx("min-h-0 flex-1", pad && "p-2.5")}>{children}</div>
    </section>
  );
}

function Banner({ level = "warn", title, children, actions }) {
  return (
    <div className="border rounded-[2px] px-2.5 py-2 flex gap-2 items-start text-xs"
      style={{ background: TONES[level].background, borderColor: "color-mix(in oklab, " + TONES[level].borderColor + " 50%, transparent)" }}>
      <span className="font-semibold mt-px" style={{ color: TONES[level].color }}>{level === "crit" ? "✕" : level === "ok" ? "✓" : "⚠"}</span>
      <div className="flex-1 leading-snug">
        {title && <p className="font-semibold" style={{ color: TONES[level].color }}>{title}</p>}
        <div className="text-ink">{children}</div>
      </div>
      {actions}
    </div>
  );
}

function EmptyState({ glyph = "◇", title, body, children, className }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center gap-2 p-8", className)}>
      <div className="w-9 h-9 border-2 border-bds text-dim flex items-center justify-center text-lg font-mono rounded-[2px]">{glyph}</div>
      <p className="text-sm font-semibold">{title}</p>
      {body && <p className="text-xs text-dim max-w-72 leading-relaxed">{body}</p>}
      {children && <div className="mt-1 flex gap-2">{children}</div>}
    </div>
  );
}

/* ---------- overlays ---------- */
function useDismiss(ref, onClose) {
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, []);
}

function Popover({ anchor, onClose, children, width = 248 }) {
  const ref = useRef(null);
  useDismiss(ref, onClose);
  const x = Math.min(Math.max(8, anchor.x), window.innerWidth - width - 8);
  const below = anchor.y + 8;
  const style = { left: x, width };
  if (below + 260 > window.innerHeight) style.bottom = window.innerHeight - anchor.y2 + 6; else style.top = below;
  return (
    <div ref={ref} className="fixed z-[80] bg-surface border border-bds shadow-[var(--shadow)] rounded-[2px]" style={style}>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children, footer, width = 420 }) {
  const ref = useRef(null);
  useDismiss(ref, onClose);
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center" style={{ background: "oklch(0.2 0.01 255 / 0.35)" }}>
      <div ref={ref} className="bg-surface border border-bds shadow-[var(--shadow)] rounded-[2px] flex flex-col max-h-[80vh]" style={{ width }}>
        <header className="flex items-center justify-between px-3 h-8 border-b border-bd bg-raised shrink-0">
          <h3 className="text-xs font-semibold">{title}</h3>
          <Btn variant="ghost" onClick={onClose} title="Close">✕</Btn>
        </header>
        <div className="p-3 overflow-auto">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-3 py-2 border-t border-bd bg-raised">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- chrome: menubar + statusbar ---------- */
function MenuBar({ brand, menus, right }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, []);
  return (
    <div ref={ref} className="h-8 flex items-stretch border-b border-bd bg-raised px-1.5 gap-0.5 shrink-0 relative z-[70]">
      <div className="flex items-center gap-1.5 pr-2 mr-1 border-r border-bd">
        <span className="w-4.5 h-4.5 w-[18px] h-[18px] flex items-center justify-center text-[9px] font-bold font-mono rounded-[2px]"
          style={{ background: "var(--ink-solid)", color: "var(--text-inv)" }}>SF</span>
        <span className="text-xs font-semibold tracking-tight">{brand}</span>
      </div>
      {menus.map((m, mi) => (
        <div key={m.label} className="relative flex">
          <button type="button"
            className={cx("px-2 text-xs my-1 rounded-[2px]", open === mi ? "bg-[var(--sel-bg)] text-[var(--sel)]" : "text-dim hover:text-ink hover:bg-surface-2")}
            onClick={() => setOpen(open === mi ? null : mi)}
            onMouseEnter={() => open != null && setOpen(mi)}>
            {m.label}
          </button>
          {open === mi && (
            <div className="absolute top-full left-0 w-60 bg-surface border border-bds shadow-[var(--shadow)] py-1 rounded-[2px]">
              {m.items.map((it, ii) => it === "-" ? <div key={ii} className="my-1 border-t border-bd"></div> : (
                <button key={ii} type="button" disabled={it.disabled}
                  className={cx("w-full flex items-center px-2.5 h-6 text-xs text-left", it.disabled ? "text-faint cursor-default" : "hover:bg-[var(--sel-bg)]")}
                  onClick={() => { setOpen(null); it.onClick && it.onClick(); }}>
                  <span className="flex-1">{it.label}</span>
                  {it.kbd && <Kbd>{it.kbd}</Kbd>}
                  {it.checked != null && <span className="text-2xs font-mono text-dim">{it.checked ? "✓" : ""}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex-1"></div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

function StatusBar({ left, right }) {
  return (
    <div className="h-6 flex items-center gap-3 px-2 border-t border-bd bg-raised text-2xs text-dim shrink-0 font-mono">
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex-1"></div>
      <div className="flex items-center gap-3">{right}</div>
    </div>
  );
}

/* ---------- charts (pure CSS) ---------- */
function Bars({ rows, max }) {
  const m = max || Math.max(...rows.map((r) => Math.max(r.value, r.prev ?? 0)), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[140px_1fr_72px] items-center gap-2 text-2xs">
          <span className="truncate text-dim">{r.label}</span>
          <div className="h-2.5 bg-surface-2 relative rounded-[1px] overflow-hidden">
            {r.prev != null && <div className="absolute inset-y-0 left-0 opacity-30" style={{ width: (r.prev / m) * 100 + "%", background: "var(--text-faint)" }}></div>}
            <div className="absolute inset-y-0 left-0" style={{ width: (r.value / m) * 100 + "%", background: r.color || "var(--text-dim)" }}></div>
          </div>
          <span className="font-mono text-right">
            {r.prev != null && <span className="text-faint line-through mr-1">{r.prev}</span>}
            <b>{r.value}</b>
          </span>
        </div>
      ))}
    </div>
  );
}
function Hist({ buckets, height = 72 }) {
  const m = Math.max(...buckets.map((b) => b.n), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col justify-end items-center gap-0.5">
            <span className="font-mono text-2xs text-dim">{b.n}</span>
            <div className="w-full" style={{ height: Math.max(2, (b.n / m) * (height - 26)) + "px", background: "var(--text-dim)" }}></div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1 border-t border-bd pt-0.5">
        {buckets.map((b) => <span key={b.label} className="flex-1 text-center font-mono text-2xs text-faint">{b.label}</span>)}
      </div>
    </div>
  );
}

/* ---------- tab strip (desktop-app squared tabs) ---------- */
function TabStrip({ tabs, value, onChange }) {
  return (
    <div className="flex items-end gap-0.5 px-2 pt-1.5 border-b border-bd bg-bg shrink-0">
      {tabs.map((t) => (
        <button key={t.v} type="button" onClick={() => onChange(t.v)}
          className={cx("px-3 h-7 text-xs font-medium border border-b-0 rounded-t-[2px] flex items-center gap-1.5 -mb-px",
            value === t.v ? "bg-surface border-bd text-ink font-semibold" : "bg-transparent border-transparent text-dim hover:text-ink hover:bg-surface-2")}>
          {t.label}
          {t.badge != null && t.badge > 0 && <Badge tone={t.badgeTone || "warn"}>{t.badge}</Badge>}
          {t.kbd && <KeyHint>{t.kbd}</KeyHint>}
        </button>
      ))}
    </div>
  );
}

Object.assign(window, {
  cx, Kbd, KeyHint, TONES, Badge, Dot, ShiftChip,
  Btn, Seg, TextInput, NumInput, SelectBox, Check, Field,
  Panel, Banner, EmptyState, Popover, Modal, MenuBar, StatusBar,
  Bars, Hist, TabStrip, useDismiss,
});
