import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Wallet,
  FileChartColumn,
  Settings2,
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  Clock3,
  Check,
  AlertCircle,
  X,
  Mail,
  LockKeyhole,
  Layers3,
  ExternalLink,
  RefreshCw,
  Facebook,
} from 'lucide-react';
import Dashboard from './Dashboard.jsx';
import Reports from './Reports.jsx';
import Accounts from './Accounts.jsx';
import MetaAISettings from './MetaAISettings.jsx';
import { Button, Badge, Modal } from './ui.jsx';
import { createDemo } from '../lib/demo.js';
import { SEVEN_DAYS, todayISO } from '../lib/metrics.js';
import { api } from '../lib/api.js';
const emptyData = {
  bms: [],
  accounts: [],
  campaigns: [],
  rows: [],
  clients: [],
  links: [],
  configs: [],
};
const STORAGE = 'ads_hub_session',
  CACHE = 'ads_hub_fb_accounts',
  DEMO = 'ads_hub_demo_data';
const safeRead = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};
const safeWrite = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The backend is authoritative when browser storage is unavailable. */
  }
};
const safeRemove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {}
};
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Layers3 size={23} />
      </span>
      <span>
        ads<span className="brand-light">hub</span>
        <span className="brand-point">.</span>
      </span>
    </div>
  );
}
function Login({ onLogin, onDemo, expired }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(expired || '');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onLogin(email, password);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-art">
        <Logo />
        <div className="login-manifesto">
          <span className="eyebrow">THE MEDIA BUYER’S WORKSPACE</span>
          <h1>
            Ít tab hơn.
            <br />
            Nhiều góc nhìn hơn<span>.</span>
          </h1>
          <p>
            Chiến dịch, dữ liệu và báo cáo khách hàng.
            <br />
            Mọi thứ bạn cần để làm quảng cáo tốt hơn.
          </p>
          <div className="login-visual">
            <div className="visual-top">
              <span>
                <i />
                CAMPAIGN PULSE
              </span>
              <span>FACEBOOK ADS</span>
            </div>
            <div className="visual-bars">
              {[30, 44, 38, 59, 51, 67, 61, 74, 68, 83, 78, 95].map((h, i) => (
                <i key={i} style={{ height: `${h}%`, opacity: 0.3 + i * 0.058 }} />
              ))}
            </div>
            <div className="visual-bottom">
              <span>
                <ShieldCheck size={14} />
                Một workspace riêng cho bạn
              </span>
              <ArrowUpRight size={16} />
            </div>
          </div>
        </div>
        <div className="login-art-footer">
          BUILT FOR FOCUS.<span>ADS HUB / 01</span>
        </div>
      </div>
      <div className="login-form-side">
        <div className="login-mobile-logo">
          <Logo />
        </div>
        <div className="login-form">
          <span className="login-kicker">CHÀO MỪNG TRỞ LẠI</span>
          <h2>Vào workspace của bạn</h2>
          <p>Đăng nhập để tiếp tục theo dõi và tối ưu quảng cáo.</p>
          <form onSubmit={submit}>
            <label className="field">
              Email
              <div className="input-with-icon">
                <Mail size={16} />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="ban@congty.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>
            <label className="field">
              Mật khẩu
              <div className="input-with-icon">
                <LockKeyhole size={16} />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                  placeholder="Nhập mật khẩu của bạn"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </label>
            {error && (
              <div className="form-error" role="alert">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
            <Button variant="primary full" busy={busy} type="submit">
              Đăng nhập
              <ArrowRight size={16} />
            </Button>
          </form>
          <div className="login-session">
            <ShieldCheck size={14} />
            Phiên được giữ trong 7 ngày hoạt động.
          </div>
          <div className="or-divider">
            <span>khám phá trước khi kết nối</span>
          </div>
          <Button className="full demo-button" onClick={onDemo}>
            Mở không gian dữ liệu mẫu
            <ArrowUpRight size={16} />
          </Button>
          <p className="demo-note">
            Dữ liệu minh họa riêng biệt. Không cần kết nối tài khoản Meta.
          </p>
        </div>
        <div className="login-bottom">Dữ liệu của bạn. Không gian của bạn.</div>
      </div>
    </div>
  );
}
function Settings({ status, demo }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE / CẤU HÌNH</div>
          <h1>
            Cài đặt<span className="heading-dot">.</span>
          </h1>
          <p>Kiểm tra các kết nối cần thiết để đưa workspace vào hoạt động.</p>
        </div>
        {demo && <Badge tone="warning">Đang xem dữ liệu mẫu</Badge>}
      </div>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>Trạng thái tích hợp</h2>
          <ShieldCheck size={18} />
        </div>
        {[
          ['database', 'Supabase', 'Cơ sở dữ liệu và tài khoản đăng nhập'],
          ['metaToken', 'Meta System User Token', 'Tự kéo BM và đồng bộ khi bạn không mở ứng dụng'],
          ['oauth', 'Facebook OAuth', 'Đăng nhập và cấp quyền qua Meta App'],
          ['cron', 'Cron 30 phút', 'Đồng bộ định kỳ với CRON_SECRET'],
        ].map(([key, name, description]) => (
          <div className="setting-row" key={key}>
            <div>
              <h3>{name}</h3>
              <p>{key === 'oauth' && status?.oauthIssue ? status.oauthIssue : description}</p>
            </div>
            <Badge tone={status?.[key] ? 'positive' : 'warning'}>
              {status?.[key] ? 'Đã có cấu hình' : 'Chưa cấu hình'}
            </Badge>
          </div>
        ))}
        <div className="setting-row">
          <div>
            <h3>Phiên bản Graph API</h3>
            <p>Cấu hình bằng META_API_VERSION</p>
          </div>
          <code>{status?.version || 'v25.0'}</code>
        </div>
      </section>
      <section className="panel setup-guide">
        <h2>Đưa Ads Hub lên Vercel</h2>
        <ol>
          <li>
            <strong>Tạo Supabase project</strong>
            <p>
              Chạy supabase/schema.sql. Tạo tài khoản trong Authentication → Users; đặt ADMIN_EMAIL
              trùng email quản trị.
            </p>
          </li>
          <li>
            <strong>Kết nối Meta</strong>
            <p>
              Tạo Business App, gán BM và tài khoản cho System User. Lưu token có quyền đọc quảng
              cáo vào META_ACCESS_TOKEN.
            </p>
          </li>
          <li>
            <strong>Thêm biến môi trường trên Vercel</strong>
            <p>
              Điền các giá trị theo .env.example. Chỉ public Supabase URL, anon key và site URL; các
              khóa còn lại giữ ở máy chủ.
            </p>
          </li>
          <li>
            <strong>Deploy và đồng bộ</strong>
            <p>
              Cron 30 phút cần gói Vercel Pro. Kết nối tài khoản, bật theo dõi, rồi gán cho từng
              khách hàng.
            </p>
          </li>
        </ol>
        <a
          href="https://vercel.com/docs/cron-jobs/usage-and-pricing"
          target="_blank"
          rel="noreferrer"
        >
          Xem giới hạn Cron trên Vercel
          <ExternalLink size={14} />
        </a>
      </section>
    </>
  );
}
export default function App() {
  const [session, setSession] = useState(null),
    [boot, setBoot] = useState(true),
    [page, setPage] = useState('dashboard'),
    [data, setData] = useState(emptyData),
    [month, setMonth] = useState(todayISO().slice(0, 7)),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [syncing, setSyncing] = useState(false),
    [notifications, setNotifications] = useState([]),
    [expired, setExpired] = useState(''),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [status, setStatus] = useState(null),
    [loadError, setLoadError] = useState('');
  const sessionRef = useRef(session),
    dataRef = useRef(data),
    busyRef = useRef(false),
    dirty = useRef(false),
    requestId = useRef(0),
    lastActivitySync = useRef(0);
  sessionRef.current = session;
  dataRef.current = data;
  const demo = Boolean(session?.demo);
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setNotifications((v) => [...v, { id, message, type }]);
    setTimeout(() => setNotifications((v) => v.filter((t) => t.id !== id)), 5500);
  }, []);
  const remember = (s) => {
    setSession(s);
    sessionRef.current = s;
    safeWrite(STORAGE, s);
  };
  function clear(message = '') {
    requestId.current++;
    setSession(null);
    sessionRef.current = null;
    setData(emptyData);
    safeRemove(STORAGE);
    safeRemove(CACHE);
    setLoading(false);
    setLoadError('');
    setExpired(message);
  }
  const handleError = (e) => {
    if (e.status === 401) clear(e.message);
    else toast(e.message, 'error');
  };
  async function refresh(silent = false) {
    const s = sessionRef.current;
    if (!s) return;
    const request = ++requestId.current;
    if (!silent) setLoading(true);
    try {
      let next;
      if (s.demo) {
        const stored = safeRead(DEMO) || createDemo(month);
        next =
          page === 'reports'
            ? {
                ...stored,
                rows: createDemo(month).rows.filter((r) =>
                  stored.campaigns.some((c) => c.id === r.campaign_id),
                ),
              }
            : stored;
      } else next = await api(`/api/data${page === 'reports' ? `?month=${month}` : ''}`);
      if (request === requestId.current) {
        setData(next);
        setLoadError('');
        if (!s.demo) safeWrite(CACHE, { email: s.email, bms: next.bms, accounts: next.accounts });
      }
    } catch (e) {
      if (request === requestId.current) {
        setLoadError(e.message);
        handleError(e);
      }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    api('/api/status')
      .then(setStatus)
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get('facebook') && window.opener) {
      window.opener.postMessage(
        {
          type: 'ads-hub-facebook',
          status: params.get('facebook'),
          message: params.get('message'),
        },
        window.location.origin,
      );
      window.close();
    }
    const start = async () => {
      const saved = safeRead(STORAGE);
      if (saved?.demo) {
        if (Date.now() - saved.lastActive > SEVEN_DAYS)
          clear('Phiên đăng nhập đã hết hạn sau 7 ngày không hoạt động');
        else remember(saved);
      } else {
        try {
          const r = await api('/api/auth/session');
          remember(r.session);
          if (r.session.role === 'client') setPage('reports');
        } catch (e) {
          if (saved)
            clear(
              e.status === 401
                ? 'Phiên đăng nhập đã hết hạn sau 7 ngày không hoạt động'
                : e.message,
            );
        }
      }
      setBoot(false);
    };
    start();
  }, []);
  useEffect(() => {
    if (session) refresh();
  }, [session?.email, session?.demo, page, month]);
  useEffect(() => {
    if (!session) return;
    const expire = () => {
      const s = sessionRef.current;
      if (s && Date.now() - s.lastActive > SEVEN_DAYS) {
        clear('Phiên đăng nhập đã hết hạn sau 7 ngày không hoạt động');
        return true;
      }
      return false;
    };
    const activity = () => {
      if (expire()) return;
      const s = sessionRef.current;
      if (!s) return;
      const next = { ...s, lastActive: Date.now() };
      sessionRef.current = next;
      setSession(next);
      safeWrite(STORAGE, next);
      dirty.current = true;
      if (!next.demo && Date.now() - lastActivitySync.current > 60000) {
        lastActivitySync.current = Date.now();
        api('/api/auth/session', { method: 'POST', body: '{}' })
          .then((r) => {
            if (sessionRef.current?.email === r.session.email) {
              remember({
                ...r.session,
                lastActive: Math.max(r.session.lastActive, sessionRef.current.lastActive),
              });
            }
            dirty.current = false;
          })
          .catch(handleError);
      }
    };
    const check = async () => {
      if (expire()) return;
      const s = sessionRef.current;
      if (!s?.demo && dirty.current) {
        lastActivitySync.current = Date.now();
        try {
          const r = await api('/api/auth/session', { method: 'POST', body: '{}' });
          if (sessionRef.current?.email === r.session.email)
            remember({
              ...r.session,
              lastActive: Math.max(r.session.lastActive, sessionRef.current.lastActive),
            });
          dirty.current = false;
        } catch (e) {
          handleError(e);
        }
      }
    };
    const storage = (e) => {
      if (e.key === STORAGE) {
        const saved = safeRead(STORAGE);
        if (!saved) clear();
        else if (
          saved.email === sessionRef.current?.email &&
          saved.lastActive > sessionRef.current.lastActive
        )
          remember(saved);
      }
    };
    document.addEventListener('click', activity);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', expire);
    const interval = setInterval(check, 60000);
    return () => {
      document.removeEventListener('click', activity);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', expire);
      clearInterval(interval);
    };
  }, [session?.email, session?.demo]);
  async function login(email, password) {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    remember(r.session);
    setExpired('');
    setPage(r.session.role === 'client' ? 'reports' : 'dashboard');
  }
  function enterDemo() {
    const now = Date.now();
    remember({
      email: 'buyer@adshub.demo',
      fb_user_id: 'demo',
      role: 'admin',
      demo: true,
      loginAt: now,
      lastActive: now,
    });
    if (!safeRead(DEMO)) safeWrite(DEMO, createDemo());
    setPage('dashboard');
    setExpired('');
  }
  async function logout() {
    if (!demo) {
      try {
        await api('/api/auth/logout', { method: 'POST', body: '{}' });
      } catch (e) {
        if (e.status !== 401) {
          toast('Chưa đăng xuất được ở máy chủ. Vui lòng thử lại.', 'error');
          return;
        }
      }
    }
    clear();
  }
  function mutateDemo(update) {
    const next = update(dataRef.current);
    setData(next);
    dataRef.current = next;
    safeWrite(DEMO, next);
    safeWrite(CACHE, { email: session.email, bms: next.bms, accounts: next.accounts });
  }
  async function sync(options = {}, silent = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSyncing(true);
    try {
      if (demo) {
        mutateDemo((d) => ({
          ...d,
          accounts: d.accounts.map((a) => ({ ...a, last_synced_at: new Date().toISOString() })),
        }));
        if (!silent) toast('Đã làm mới dữ liệu mẫu.');
      } else {
        const r = await api('/api/sync', {
          method: 'POST',
          body: JSON.stringify(options),
          timeoutMs: 270000,
        });
        await refresh(true);
        if (r.failed)
          toast(
            `${r.synced} tài khoản thành công, ${r.failed} chưa đồng bộ được. Kiểm tra trang Tài khoản.`,
            'error',
          );
        else if (!silent) toast(`Đã đồng bộ ${r.synced} tài khoản.`);
      }
    } catch (e) {
      handleError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setSyncing(false);
    }
  }
  async function connect() {
    if (demo) {
      mutateDemo((d) => ({
        ...createDemo(month),
        clients: d.clients.length ? d.clients : createDemo().clients,
        configs: d.configs.length ? d.configs : createDemo(month).configs,
      }));
      toast('Đã kết nối 2 BM và 3 tài khoản mẫu.');
      return;
    }
    const r = await api('/api/connect', { method: 'POST', body: '{}', timeoutMs: 75000 });
    remember({ ...session, fb_user_id: r.fb_user_id });
    await refresh();
    toast(`Đã kết nối ${r.bms} BM và ${r.accounts} tài khoản.`);
  }
  async function oauth() {
    if (demo) {
      await connect();
      return;
    }
    if (status?.oauth === false) {
      toast(status.oauthIssue || 'Cần hoàn tất cấu hình Facebook OAuth trên máy chủ.', 'error');
      return;
    }
    const popup = window.open('/api/facebook/start', 'ads-hub-facebook', 'width=620,height=750');
    if (!popup) {
      toast('Trình duyệt đang chặn popup. Cho phép popup để kết nối Facebook.', 'error');
      return;
    }
    const listener = async (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== popup ||
        event.data?.type !== 'ads-hub-facebook'
      )
        return;
      window.removeEventListener('message', listener);
      clearInterval(timer);
      if (event.data.status === 'connected') {
        await refresh();
        toast('Đã kết nối Facebook.');
        await sync();
      } else toast(event.data.message || 'Kết nối bị hủy.', 'error');
    };
    window.addEventListener('message', listener);
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        window.removeEventListener('message', listener);
      }
    }, 1000);
  }
  async function disconnect() {
    setBusy(true);
    try {
      if (demo)
        mutateDemo((d) => ({ ...d, bms: [], accounts: [], campaigns: [], rows: [], links: [] }));
      else {
        await api('/api/accounts', { method: 'DELETE' });
        await refresh();
      }
      safeRemove(CACHE);
      toast('Đã ngắt kết nối Facebook.');
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(id, is_tracked) {
    try {
      if (demo)
        mutateDemo((d) => ({
          ...d,
          accounts: d.accounts.map((a) => (a.id === id ? { ...a, is_tracked } : a)),
        }));
      else {
        await api('/api/accounts', { method: 'PATCH', body: JSON.stringify({ id, is_tracked }) });
        await refresh(true);
      }
      toast(is_tracked ? 'Đã bật theo dõi tài khoản.' : 'Đã tắt theo dõi tài khoản.');
    } catch (e) {
      handleError(e);
    }
  }
  async function saveReport(client_id, reportMonth, config) {
    if (demo) {
      mutateDemo((d) => ({
        ...d,
        configs: [
          ...d.configs.filter((c) => !(c.client_id === client_id && c.month === reportMonth)),
          {
            ...config,
            id: `report_${client_id}_${reportMonth}`,
            client_id,
            month: reportMonth,
            workspace_id: 'demo',
            updated_at: new Date().toISOString(),
          },
        ],
      }));
    } else {
      await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ client_id, month: reportMonth, config }),
      });
      await refresh(true);
    }
  }
  async function saveClient(input) {
    if (demo) {
      const id = input.id || `client_${crypto.randomUUID()}`;
      mutateDemo((d) => ({
        ...d,
        clients: [
          ...d.clients.filter((c) => c.id !== id),
          {
            id,
            name: input.name,
            owner_email: input.owner_email.toLowerCase(),
            workspace_id: 'demo',
          },
        ],
        links: [
          ...d.links.filter((l) => l.client_id !== id),
          ...input.account_ids.map((account_id) => ({
            client_id: id,
            account_id,
            workspace_id: 'demo',
          })),
        ],
      }));
    } else {
      await api('/api/clients', { method: input.id ? 'PUT' : 'POST', body: JSON.stringify(input) });
      await refresh(true);
    }
    toast('Đã lưu khách hàng.');
  }
  if (boot)
    return (
      <div className="boot">
        <Logo />
        <div className="loading-line" />
      </div>
    );
  if (!session) return <Login onLogin={login} onDemo={enterDemo} expired={expired} />;
  const nav = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'accounts', label: 'Tài khoản quảng cáo', icon: Wallet },
    { id: 'reports', label: 'Báo cáo', icon: FileChartColumn },
    { id: 'meta-ai', label: 'Meta AI & prompt', icon: Sparkles },
  ].filter((n) => session.role === 'admin' || n.id === 'reports');
  const expires = Math.max(0, Math.ceil((session.lastActive + SEVEN_DAYS - Date.now()) / 86400000));
  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${mobile ? 'mobile-open' : ''}`}>
      <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMobile(false)} />
      <aside className="sidebar">
        <Logo />
        <div className="workspace-chip">
          <span className="workspace-avatar">P</span>
          <span>
            <strong>Personal workspace</strong>
            <small>{session.role === 'admin' ? 'Media buyer' : 'Khách hàng'}</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              title={n.label}
              className={page === n.id ? 'active' : ''}
              onClick={() => {
                setPage(n.id);
                setMobile(false);
              }}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === 'reports' && <b>{data.configs.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span>
              <Sparkles size={16} />
              Làm việc có góc nhìn
            </span>
            <p>Để dữ liệu dẫn đường cho chiến dịch tiếp theo.</p>
            <div>
              FACEBOOK ADS ONLY
              <ArrowUpRight size={13} />
            </div>
          </div>
          {session.role === 'admin' && (
            <button
              className={`settings-nav ${page === 'settings' ? 'active' : ''}`}
              onClick={() => setPage('settings')}
            >
              <Settings2 size={18} />
              <span>Cài đặt & kết nối</span>
            </button>
          )}
          <div className="profile">
            <span className="profile-avatar">{session.email[0].toUpperCase()}</span>
            <span>
              <strong>{session.role === 'admin' ? 'Media Buyer' : 'Khách hàng'}</strong>
              <small>{session.email}</small>
            </span>
            <button title="Đăng xuất" aria-label="Đăng xuất" onClick={logout}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div>
            <button
              className="icon-button desktop-toggle"
              aria-label="Thu gọn menu"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <button
              className="icon-button mobile-toggle"
              aria-label="Mở menu"
              onClick={() => setMobile(!mobile)}
            >
              <PanelLeftOpen size={18} />
            </button>
            <span className="topbar-divider" />
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>
              {page === 'settings' ? 'Cài đặt' : nav.find((n) => n.id === page)?.label}
            </strong>
          </div>
          <div>
            {demo ? (
              <span className="demo-label">
                <span className="status-dot warning" />
                Dữ liệu mẫu
              </span>
            ) : (
              <span className="live-label">
                <span className="status-dot positive" />
                Meta Ads
              </span>
            )}
            <span className="topbar-divider" />
            <span className="expiry">
              <Clock3 size={13} />
              Hết hạn sau {expires} ngày
            </span>
            <button
              className="icon-button top-logout"
              aria-label="Đăng xuất phiên"
              onClick={logout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className={loading ? 'loading-data' : ''}>
          {syncing && (
            <div className="notice" role="status">
              <RefreshCw size={16} className="spin" />
              <span>
                Đang đồng bộ chi tiêu từ Meta. Bạn có thể tiếp tục xem tài khoản và báo cáo; dữ liệu
                sẽ cập nhật khi hoàn tất.
              </span>
            </div>
          )}
          {loadError && (
            <div className="notice error">
              <AlertCircle size={16} />
              <span>{loadError}</span>
              <Button onClick={() => refresh()}>Thử lại</Button>
            </div>
          )}
          {loading && <div className="top-loading" role="status" aria-label="Đang tải dữ liệu" />}
          {page === 'dashboard' && (
            <Dashboard
              data={data}
              toast={toast}
              sync={() => sync()}
              busy={busy}
              goReports={() => setPage('reports')}
              goMetaAI={() => setPage('meta-ai')}
              demo={demo}
            />
          )}{' '}
          {page === 'accounts' && (
            <Accounts
              data={data}
              connect={connect}
              disconnect={disconnect}
              toggle={toggle}
              sync={sync}
              busy={busy}
              toast={toast}
              demo={demo}
              oauth={oauth}
              status={status}
            />
          )}{' '}
          {page === 'reports' && (
            <Reports
              data={data}
              session={session}
              month={month}
              setMonth={setMonth}
              saveReport={saveReport}
              saveClient={saveClient}
              sync={sync}
              refresh={refresh}
              busy={busy}
              toast={toast}
              demo={demo}
            />
          )}{' '}
          {page === 'settings' && <Settings status={status} demo={demo} />}
          {page === 'meta-ai' && session.role === 'admin' && (
            <MetaAISettings demo={demo} toast={toast} />
          )}
        </main>
      </div>
      <div className="toasts" aria-live="polite">
        {notifications.map((t) => (
          <div className={`toast ${t.type}`} key={t.id}>
            {t.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
            <span>{t.message}</span>
            <button
              aria-label="Ẩn thông báo"
              onClick={() => setNotifications((v) => v.filter((n) => n.id !== t.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
