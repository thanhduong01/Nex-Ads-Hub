import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Check,
  X,
  Search,
  LoaderCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
export function TypingText({ text }) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLength(text.length);
      return;
    }
    setLength(0);
    const timer = setInterval(
      () =>
        setLength((n) => {
          if (n >= text.length) {
            clearInterval(timer);
            return n;
          }
          return Math.min(text.length, n + 3);
        }),
      20,
    );
    return () => clearInterval(timer);
  }, [text]);
  return (
    <p className="typing" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, length)}</span>
    </p>
  );
}
export function Button({ children, variant = '', className = '', busy = false, ...props }) {
  return (
    <button
      type="button"
      className={`btn ${variant} ${className}`}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle size={15} className="spin" />}
      {children}
    </button>
  );
}
export function Badge({ children, tone = 'neutral' }) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Dropdown({
  label,
  value,
  options,
  onChange,
  icon: Icon,
  disabled = false,
  compact = false,
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const root = useRef();
  useEffect(() => {
    const close = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const key = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, []);
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <div className={`dropdown ${compact ? 'compact' : ''}`} ref={root}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`dropdown-trigger ${open ? 'active' : ''}`}
        onClick={() => {
          setOpen(!open);
          setQuery('');
        }}
      >
        {Icon && <Icon size={15} />}
        <span>
          {label && <small>{label}</small>}
          <b>{current?.label || 'Chọn…'}</b>
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dropdown-menu">
          <div className="dropdown-search">
            <Search size={14} />
            <input
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              placeholder="Tìm kiếm…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div role="listbox" aria-label={label}>
            {options
              .filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
              .map((o) => (
                <button
                  type="button"
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span>{o.label}</span>
                  {o.value === value && <Check size={15} />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef();
  const previous = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    previous.current = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const els = [
          ...ref.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
          ),
        ];
        if (!els.length) {
          e.preventDefault();
          return;
        }
        const first = els[0],
          last = els.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      previous.current?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Đóng" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon size={26} />
        </div>
      )}
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function SearchInput({ value, onChange, placeholder = 'Tìm kiếm…' }) {
  return (
    <label className="search-input">
      <Search size={16} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button aria-label="Xóa tìm kiếm" onClick={() => onChange('')}>
          <X size={13} />
        </button>
      )}
    </label>
  );
}
export function Trend({ value, inverse = false }) {
  if (value == null || !Number.isFinite(value))
    return <span className="trend muted">Chưa đủ dữ liệu</span>;
  const up = value >= 0;
  return (
    <span className={`trend ${up !== inverse ? 'positive' : 'negative'}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {Math.abs(value).toFixed(1)}%
    </span>
  );
}
