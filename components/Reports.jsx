import { useEffect, useMemo, useState } from 'react';
import {
  Folder,
  Plus,
  FileSpreadsheet,
  FileText,
  ChevronRight,
  SlidersHorizontal,
  RefreshCw,
  LockKeyhole,
  Calculator,
  Check,
  ArrowDownUp,
  Pencil,
  Users,
  Trash2,
  CalendarDays,
  ArrowUpRight,
} from 'lucide-react';
import { Button, Badge, Dropdown, Empty, Modal } from './ui.jsx';
import Pagination, { usePagination } from './Pagination.jsx';
import {
  DEFAULT_CONFIG,
  METRICS,
  makeReport,
  format,
  todayISO,
  validateConfig,
  validateCustom,
} from '../lib/metrics.js';
import { excelReport, pdfReport } from '../lib/exports.js';
const fresh = () => structuredClone(DEFAULT_CONFIG);
function MetricModal({ config, onSave, onClose }) {
  const [selected, setSelected] = useState([...config.selected_metrics]);
  const [names, setNames] = useState({ ...config.custom_names });
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setSaving(true);
    try {
      await onSave({ ...config, selected_metrics: selected, custom_names: names });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Chọn chỉ số báo cáo"
      subtitle="Giữ các chỉ số khách hàng cần. Đặt tên theo cách bạn muốn trình bày."
      onClose={onClose}
      wide
    >
      <div className="metric-checklist">
        <div className="metric-checklist-label">
          <span>CHỈ SỐ GỐC TỪ META</span>
          <span>TÊN HIỂN THỊ TÙY CHỈNH</span>
        </div>
        {Object.entries(METRICS).map(([key, m]) => (
          <div key={key} className="metric-option">
            <label>
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(e) =>
                  setSelected((v) => (e.target.checked ? [...v, key] : v.filter((k) => k !== key)))
                }
              />
              <span>
                {m.name}
                <small>{key}</small>
              </span>
            </label>
            <input
              aria-label={`Tên hiển thị ${key}`}
              placeholder={m.name}
              maxLength={60}
              value={names[key] || ''}
              onChange={(e) => setNames((v) => ({ ...v, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <span>{selected.length} chỉ số được chọn</span>
        <Button onClick={onClose}>Hủy</Button>
        <Button variant="primary" busy={saving} disabled={!selected.length} onClick={save}>
          Lưu cấu hình
          <Check size={14} />
        </Button>
      </div>
    </Modal>
  );
}
function CustomModal({ onSave, onClose }) {
  const [name, setName] = useState(''),
    [left, setLeft] = useState('purchase_value'),
    [operator, setOperator] = useState('/'),
    [rightType, setRightType] = useState('metric'),
    [right, setRight] = useState('spend'),
    [type, setType] = useState('ratio'),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const options = Object.entries(METRICS).map(([value, m]) => ({ value, label: m.name }));
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const metric = {
        id: `custom_${crypto.randomUUID()}`,
        name: name.trim(),
        left,
        operator,
        rightType,
        right,
        type,
      };
      validateCustom(metric);
      await onSave(metric);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Tạo chỉ số tùy chỉnh"
      subtitle="Kết hợp hai chỉ số hoặc một hằng số bằng phép toán."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label className="field">
          Tên chỉ số
          <input
            autoFocus
            required
            maxLength={60}
            placeholder="Ví dụ: ROAS thực"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="formula-builder">
          <Dropdown label="Chỉ số thứ nhất" value={left} onChange={setLeft} options={options} />
          <Dropdown
            label="Phép toán"
            value={operator}
            onChange={setOperator}
            options={['+', '-', '*', '/'].map((v) => ({
              value: v,
              label: v === '*' ? '×' : v === '/' ? '÷' : v,
            }))}
          />
          <Dropdown
            label="Đối số thứ hai"
            value={rightType}
            onChange={(v) => {
              setRightType(v);
              setRight(v === 'metric' ? 'spend' : '1');
            }}
            options={[
              { value: 'metric', label: 'Chỉ số' },
              { value: 'constant', label: 'Hằng số' },
            ]}
          />
          {rightType === 'metric' ? (
            <Dropdown label="Chọn chỉ số" value={right} onChange={setRight} options={options} />
          ) : (
            <label className="field">
              Hằng số
              <input
                aria-label="Hằng số"
                type="number"
                step="any"
                required
                value={right}
                onChange={(e) => setRight(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="formula-preview">
          <Calculator size={16} />
          <code>
            {left} {operator} {right}
          </code>
        </div>
        <Dropdown
          label="Định dạng hiển thị"
          value={type}
          onChange={setType}
          options={[
            { value: 'ratio', label: 'Tỷ lệ (×)' },
            { value: 'money', label: 'Tiền tệ' },
            { value: 'number', label: 'Số' },
            { value: 'percent', label: 'Phần trăm (giá trị × 1%)' },
          ]}
        />
        <p className="field-hint">
          Chia cho 0 hiển thị “—”. Dòng tổng tính công thức từ tổng dữ liệu gốc.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <Button onClick={onClose} type="button">
            Hủy
          </Button>
          <Button variant="primary" type="submit" busy={saving}>
            Tạo chỉ số
            <Plus size={14} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ClientModal({ data, client, onSave, onClose }) {
  const [name, setName] = useState(client?.name || ''),
    [email, setEmail] = useState(client?.owner_email || ''),
    [ids, setIds] = useState(
      data.links.filter((l) => l.client_id === client?.id).map((l) => l.account_id),
    );
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const currencies = new Set(
        data.accounts.filter((a) => ids.includes(a.id)).map((a) => a.currency),
      );
      if (currencies.size > 1)
        throw new Error('Mỗi khách hàng chỉ gán tài khoản cùng một đơn vị tiền tệ.');
      await onSave({ id: client?.id, name, owner_email: email, account_ids: ids });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={client ? 'Chỉnh sửa khách hàng' : 'Tạo khách hàng'}
      subtitle="Mỗi khách hàng có thư mục báo cáo và quyền xem riêng."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label className="field">
          Tên khách hàng
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Lá Natural"
          />
        </label>
        <label className="field">
          Email được cấp quyền xem
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </label>
        <label className="field-label">Tài khoản quảng cáo trong báo cáo</label>
        <div className="account-picks">
          {data.accounts.map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={ids.includes(a.id)}
                onChange={(e) =>
                  setIds((v) => (e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id)))
                }
              />
              <span>
                {a.name}
                <small>
                  {a.id} · {a.currency}
                </small>
              </span>
            </label>
          ))}
          {!data.accounts.length && (
            <p>Kết nối tài khoản Facebook để gán tài khoản cho khách hàng.</p>
          )}
        </div>
        <p className="field-hint">
          Email cần có tài khoản Supabase Auth để đăng nhập. Chỉ được xem thư mục được gán.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <Button onClick={onClose} type="button">
            Hủy
          </Button>
          <Button variant="primary" type="submit" busy={saving}>
            Lưu khách hàng
            <Check size={14} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export default function Reports({
  data,
  session,
  month,
  setMonth,
  saveReport,
  saveClient,
  sync,
  refresh,
  busy,
  toast,
  demo,
}) {
  const [selectedId, setSelectedId] = useState(''),
    [preview, setPreview] = useState(false),
    [previewEmail, setPreviewEmail] = useState(''),
    [modal, setModal] = useState(''),
    [exporting, setExporting] = useState(''),
    [sort, setSort] = useState({ key: 'date', dir: 1 }),
    [creating, setCreating] = useState(false);
  const isClient = session.role === 'client';
  const readOnly = isClient || preview;
  const clients = data.clients.filter((c) =>
    isClient
      ? c.owner_email === session.email.toLowerCase()
      : preview
        ? c.owner_email === previewEmail
        : true,
  );
  const selected = clients.find((c) => c.id === selectedId) || clients[0];
  const saved = data.configs.find((c) => c.client_id === selected?.id && c.month === month);
  const config = saved || fresh();
  const accountIds = data.links
    .filter((l) => l.client_id === selected?.id)
    .map((l) => l.account_id);
  const accounts = data.accounts.filter(
    (a) => accountIds.includes(a.id) && a.workspace_id === selected?.workspace_id,
  );
  const currencies = new Set(accounts.map((a) => a.currency));
  const currency = accounts[0]?.currency || 'VND';
  const mixed = currencies.size > 1;
  const rows = data.rows.filter(
    (r) =>
      r.workspace_id === selected?.workspace_id &&
      accounts.some((a) => a.id === r.account_id && a.is_tracked),
  );
  const report = useMemo(() => makeReport(rows, month, config), [data, month, selected?.id, saved]);
  const sorted = [...report.rows].sort(
    (a, b) =>
      sort.dir *
      (sort.key === 'date'
        ? a.date.localeCompare(b.date)
        : (a[sort.key] ?? -Infinity) - (b[sort.key] ?? -Infinity)),
  );
  const pagination = usePagination(
    sorted,
    JSON.stringify([selected?.id, month, sort, preview, previewEmail]),
  );
  const last = accounts
    .map((a) => a.last_synced_at)
    .filter(Boolean)
    .sort()[0];
  useEffect(() => {
    const id = setInterval(() => {
      if (!readOnly && selected && saved) sync({ month, client_id: selected.id }, true);
      else refresh(true);
    }, 1800000);
    return () => clearInterval(id);
  }, [readOnly, month, selected?.id, saved?.id]);
  async function update(config) {
    if (!selected || readOnly) return;
    validateConfig(config);
    await saveReport(selected.id, month, config);
  }
  async function create() {
    setCreating(true);
    try {
      await update(config);
      toast('Đã tạo báo cáo tháng.');
      if (!demo) await sync({ month, client_id: selected.id });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setCreating(false);
    }
  }
  async function exportFile(type) {
    if (!selected || mixed) return;
    setExporting(type);
    try {
      await (type === 'xlsx' ? excelReport : pdfReport)({
        client: selected.name,
        month,
        report: { ...report, rows: sorted },
        currency,
      });
      toast(`Đã xuất file ${type === 'xlsx' ? 'Excel' : 'PDF'}.`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setExporting('');
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE / KHÁCH HÀNG</div>
          <h1>
            Báo cáo<span className="heading-dot">.</span>
          </h1>
          <p>Biến dữ liệu thành những cuộc trò chuyện có giá trị.</p>
        </div>
        <Badge tone="running">{data.configs.length} báo cáo</Badge>
      </div>
      {readOnly && (
        <div className="notice yellow">
          <LockKeyhole size={16} />
          <span>
            Chế độ chỉ xem — Bạn chỉ có quyền xem báo cáo của mình, không thể chỉnh sửa.
            {preview && ' Đây là bản xem thử của Admin.'}
          </span>
        </div>
      )}
      <div className="reports-layout">
        <aside className="client-sidebar">
          <div className="client-sidebar-header">
            <span>KHÁCH HÀNG</span>
            <span>{clients.length}</span>
          </div>
          {!isClient && (
            <div className="role-toggle">
              <button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>
                Admin
              </button>
              <button
                className={preview ? 'active' : ''}
                disabled={!selected}
                onClick={() => {
                  setPreviewEmail(selected.owner_email);
                  setPreview(true);
                }}
              >
                Xem như Khách hàng
              </button>
            </div>
          )}
          <div className="client-list">
            {clients.map((c, i) => {
              const count = data.configs.filter((r) => r.client_id === c.id).length;
              return (
                <button
                  key={c.id}
                  className={`client-item ${selected?.id === c.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className={`client-avatar avatar-${i % 3}`}>
                    {c.name
                      .split(' ')
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{count} báo cáo</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
          </div>
          {!readOnly && (
            <Button className="add-client" onClick={() => setModal('client')}>
              <Plus size={15} />
              Tạo khách hàng
            </Button>
          )}
          <div className="client-note">
            <Folder size={21} />
            <p>
              Mỗi khách hàng.
              <br />
              Một không gian riêng.
            </p>
            <small>Báo cáo và quyền truy cập được quản lý theo thư mục.</small>
          </div>
        </aside>
        <section className="report-workspace">
          {!selected ? (
            <Empty
              icon={Users}
              title="Bắt đầu với một khách hàng"
              action={
                !readOnly && (
                  <Button variant="primary" onClick={() => setModal('client')}>
                    <Plus size={15} />
                    Tạo khách hàng
                  </Button>
                )
              }
            >
              Gán tài khoản quảng cáo để xây dựng báo cáo đầu tiên.
            </Empty>
          ) : (
            <>
              <div className="report-toolbar">
                <div className="report-breadcrumb">
                  <Folder size={16} />
                  <Dropdown
                    compact
                    label="Khách hàng"
                    value={selected.id}
                    onChange={setSelectedId}
                    options={clients.map((c) => ({ value: c.id, label: c.name }))}
                  />
                  <ChevronRight size={13} />
                  <label className="month-input">
                    <CalendarDays size={15} />
                    <input
                      aria-label="Tháng báo cáo"
                      type="month"
                      min="2000-01"
                      max="2100-12"
                      value={month}
                      onChange={(e) => {
                        if (e.target.value) setMonth(e.target.value);
                      }}
                    />
                  </label>
                </div>
                <div className="report-exports">
                  <Button
                    variant="excel"
                    disabled={!saved || mixed || !!exporting}
                    busy={exporting === 'xlsx'}
                    onClick={() => exportFile('xlsx')}
                  >
                    <FileSpreadsheet size={15} />
                    Xuất Excel
                  </Button>
                  <Button
                    variant="pdf"
                    disabled={!saved || mixed || !!exporting}
                    busy={exporting === 'pdf'}
                    onClick={() => exportFile('pdf')}
                  >
                    <FileText size={15} />
                    Xuất PDF
                  </Button>
                </div>
              </div>
              <div className="report-cover">
                <div>
                  <div className="eyebrow">BÁO CÁO HIỆU SUẤT HẰNG THÁNG</div>
                  <h2>
                    {selected.name}
                    <span>/</span>
                    {month.slice(5)}.{month.slice(0, 4)}
                  </h2>
                  <p>
                    {accounts.length} tài khoản quảng cáo <span className="separator">•</span>{' '}
                    Facebook Ads <span className="separator">•</span> {currency}
                  </p>
                </div>
                {!readOnly && (
                  <div className="report-cover-actions">
                    <Button onClick={() => setModal('editClient')}>
                      <Pencil size={14} />
                      Khách hàng
                    </Button>
                    <Button variant="primary" busy={creating} onClick={create}>
                      {saved ? <RefreshCw size={14} /> : <Plus size={14} />}{' '}
                      {saved ? 'Cập nhật báo cáo' : 'Tạo báo cáo tháng'}
                    </Button>
                  </div>
                )}
              </div>
              {mixed && (
                <div className="notice yellow">
                  Các tài khoản có nhiều đơn vị tiền tệ. Hãy sửa khách hàng để chỉ giữ tài khoản
                  cùng tiền tệ trước khi xuất.
                </div>
              )}
              {!saved ? (
                <Empty icon={FileText} title="Tháng này chưa có báo cáo">
                  {readOnly
                    ? 'Báo cáo sẽ xuất hiện sau khi Admin tạo.'
                    : 'Chọn “Tạo báo cáo tháng” để lưu cấu hình và kéo dữ liệu tháng này.'}
                </Empty>
              ) : (
                <>
                  <div className="report-highlights">
                    <div>
                      <span>CHI PHÍ QUẢNG CÁO</span>
                      <strong>{format(report.total.spend, 'money', currency)}</strong>
                    </div>
                    <div>
                      <span>DOANH THU GHI NHẬN</span>
                      <strong>{format(report.total.purchase_value, 'money', currency)}</strong>
                    </div>
                    <div>
                      <span>ĐƠN HÀNG</span>
                      <strong>{format(report.total['actions:purchase'])}</strong>
                    </div>
                    <div>
                      <span>ROAS</span>
                      <strong className="text-green">{format(report.total.ROAS, 'ratio')}</strong>
                    </div>
                  </div>
                  <div className="report-config-row">
                    <div>
                      <h3>Chi tiết theo ngày</h3>
                      <span>
                        {report.columns.length} chỉ số · {report.rows.length} ngày
                      </span>
                    </div>
                    {!readOnly && (
                      <div>
                        <Button onClick={() => setModal('metrics')}>
                          <SlidersHorizontal size={14} />
                          Chọn chỉ số
                        </Button>
                        <Button onClick={() => setModal('custom')}>
                          <Calculator size={14} />
                          Tạo chỉ số mới
                        </Button>
                      </div>
                    )}
                  </div>
                  {config.custom_metrics.length > 0 && (
                    <div className="custom-metrics">
                      <span>Chỉ số tùy chỉnh</span>
                      {config.custom_metrics.map((m) => (
                        <span
                          key={m.id}
                          className="formula-chip"
                          title={`${m.left} ${m.operator} ${m.right}`}
                        >
                          <Calculator size={12} />
                          {m.name}
                          {!readOnly && (
                            <button
                              aria-label={`Xóa ${m.name}`}
                              onClick={() =>
                                update({
                                  ...config,
                                  custom_metrics: config.custom_metrics.filter(
                                    (c) => c.id !== m.id,
                                  ),
                                }).catch((e) => toast(e.message, 'error'))
                              }
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="report-table-container">
                    <table id="daily-report-table" className="report-table">
                      <thead>
                        <tr>
                          <th>
                            <button
                              onClick={() =>
                                setSort((s) => ({
                                  key: 'date',
                                  dir: s.key === 'date' ? -s.dir : 1,
                                }))
                              }
                            >
                              Ngày <ArrowDownUp size={11} />
                            </button>
                          </th>
                          {report.columns.map((c) => (
                            <th key={c.key}>
                              <button
                                onClick={() =>
                                  setSort((s) => ({
                                    key: c.key,
                                    dir: s.key === c.key ? -s.dir : -1,
                                  }))
                                }
                              >
                                {c.name}
                                <ArrowDownUp size={11} />
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagination.items.map((r) => (
                          <tr key={r.date} className={r.future ? 'future' : ''}>
                            <td>
                              {r.date.split('-').reverse().join('/')}
                              {r.date === todayISO() && <span className="today-mark">Hôm nay</span>}
                            </td>
                            {report.columns.map((c) => (
                              <td key={c.key}>
                                {r.future ? '—' : format(r[c.key], c.type, currency)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Tổng tháng</td>
                          {report.columns.map((c) => (
                            <td key={c.key}>{format(report.total[c.key], c.type, currency)}</td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Pagination
                    pagination={pagination}
                    tableId="daily-report-table"
                    label="báo cáo theo ngày"
                  />
                  <p className="report-footnote">
                    * Tiếp cận là cộng dồn theo ngày và chiến dịch, không khử trùng lặp người dùng.
                    ROAS, CTR, CPC và chỉ số công thức được tính lại ở dòng tổng. Ngày tương lai
                    hiển thị “—”.
                  </p>
                </>
              )}
              <div className="report-sync">
                <div>
                  <span className="status-dot positive" />
                  <span>
                    Tự động cập nhật mỗi 30 phút <span className="separator">•</span> Lần cuối:{' '}
                    {last ? new Date(last).toLocaleTimeString('vi-VN') : 'Chưa đồng bộ'}
                    {demo ? ' · Dữ liệu mẫu' : ''}
                  </span>
                </div>
                {!readOnly && (
                  <Button busy={busy} onClick={() => sync({ month, client_id: selected.id })}>
                    <RefreshCw size={13} />
                    Đồng bộ tháng
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      {modal === 'metrics' && (
        <MetricModal config={config} onSave={update} onClose={() => setModal('')} />
      )}
      {modal === 'custom' && (
        <CustomModal
          onSave={(metric) =>
            update({ ...config, custom_metrics: [...config.custom_metrics, metric] })
          }
          onClose={() => setModal('')}
        />
      )}
      {['client', 'editClient'].includes(modal) && (
        <ClientModal
          data={data}
          client={modal === 'editClient' ? selected : null}
          onSave={saveClient}
          onClose={() => setModal('')}
        />
      )}
    </>
  );
}
