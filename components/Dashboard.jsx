import { useState } from 'react';
import {
  Building2,
  Wallet,
  Layers3,
  CalendarDays,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  SlidersHorizontal,
  Target,
  MousePointer2,
  ChartNoAxesCombined,
  RefreshCw,
  Search,
  Activity,
} from 'lucide-react';
import { Button, Badge, Dropdown, Empty, SearchInput, Trend } from './ui.jsx';
import Chart from './Chart.jsx';
import Pagination, { usePagination } from './Pagination.jsx';
import { aggregate, rangeFor, shiftDate, format } from '../lib/metrics.js';
import MetaAIInsights from './MetaAIInsights.jsx';
import {
  dashboardScope,
  UNASSIGNED_BM,
  campaignStatusLabel,
  campaignStatusOptions,
} from '../lib/dashboardFilters.js';
function MiniSpark({ index }) {
  const points = [
    '0,25 8,21 16,24 24,12 32,14 40,8 48,12 56,3 64,7 72,2',
    '0,24 8,17 16,20 24,15 32,18 40,7 48,13 56,9 64,3 72,5',
    '0,5 8,8 16,4 24,13 32,8 40,16 48,12 56,21 64,18 72,25',
    '0,25 8,18 16,20 24,10 32,13 40,6 48,11 56,7 64,9 72,1',
  ];
  return (
    <svg viewBox="0 0 74 30" className="mini-spark" aria-hidden="true">
      <polyline
        points={points[index]}
        fill="none"
        stroke={index === 0 ? '#9a9dff' : '#5cceb1'}
        strokeWidth="1.8"
      />
    </svg>
  );
}
export default function Dashboard({ data, toast, sync, busy, goReports, goMetaAI, demo }) {
  const [bm, setBm] = useState('all'),
    [account, setAccount] = useState('all'),
    [camp, setCamp] = useState('all'),
    [status, setStatus] = useState('all'),
    [period, setPeriod] = useState('7'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState({ key: 'spend', dir: -1 });
  const [aiBusy, setAIBusy] = useState(false),
    [analysisRequest, setAnalysisRequest] = useState(0);
  const range = rangeFor(period);
  const { tracked, choices, accounts, campChoices, campaigns, rows } = dashboardScope(
    data,
    bm,
    account,
    camp,
    status,
  );
  const selected = rows.filter((r) => r.date >= range.since && r.date <= range.until);
  const stats = aggregate(selected);
  const days = Math.round((new Date(range.until) - new Date(range.since)) / 86400000) + 1;
  const previous = aggregate(
    rows.filter((r) => r.date >= shiftDate(range.since, -days) && r.date < range.since),
  );
  const table = campaigns
    .map((c) => ({ ...c, ...aggregate(selected.filter((r) => r.campaign_id === c.id)) }))
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort.dir * ((a[sort.key] ?? 0) - (b[sort.key] ?? 0)));
  const pagination = usePagination(
    table,
    JSON.stringify([bm, account, camp, status, period, query, sort]),
  );
  const summary = [
    { name: 'Tổng chi tiêu', key: 'spend', type: 'money', icon: Wallet, inverse: true },
    { name: 'ROAS trung bình', key: 'ROAS', type: 'ratio', icon: ChartNoAxesCombined },
    { name: 'CPA trung bình', key: 'cpa', type: 'money', icon: Target, inverse: true },
    { name: 'Tỷ lệ nhấp · CTR', key: 'ctr', type: 'percent', icon: MousePointer2 },
  ];
  function pickBm(v) {
    setBm(v);
    setAccount('all');
    setCamp('all');
  }
  function pickAccount(v) {
    setAccount(v);
    setCamp('all');
  }
  function pickStatus(value) {
    setStatus(value);
    setCamp('all');
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE / HIỆU SUẤT QUẢNG CÁO</div>
          <h1>
            Tổng quan<span className="heading-dot">.</span>
          </h1>
          <p>Mọi chiến dịch, một góc nhìn. Quyết định từ dữ liệu của bạn.</p>
        </div>
        <div className="heading-actions">
          <Button onClick={sync} busy={busy}>
            <RefreshCw size={15} />
            Đồng bộ dữ liệu
          </Button>
          <Button variant="primary" onClick={goReports}>
            Tạo báo cáo
            <ArrowUpRight size={15} />
          </Button>
        </div>
      </div>
      <div className="filters">
        <SlidersHorizontal size={16} className="filter-icon" />
        <Dropdown
          label="BM sở hữu"
          icon={Building2}
          value={bm}
          onChange={pickBm}
          options={[
            { value: 'all', label: 'Tất cả BM' },
            ...data.bms.map((b) => ({ value: b.id, label: b.name })),
            ...(tracked.some((a) => !a.bm_id)
              ? [{ value: UNASSIGNED_BM, label: 'Chưa xác định BM' }]
              : []),
          ]}
        />
        <Dropdown
          label="Tài khoản QC"
          icon={Wallet}
          value={account}
          onChange={pickAccount}
          options={[
            { value: 'all', label: 'Tất cả tài khoản' },
            ...choices.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <Dropdown
          label="Trạng thái"
          icon={Activity}
          value={status}
          onChange={pickStatus}
          options={campaignStatusOptions(data.campaigns)}
        />
        <Dropdown
          label="Chiến dịch"
          icon={Layers3}
          value={camp}
          onChange={setCamp}
          options={[
            { value: 'all', label: 'Tất cả chiến dịch' },
            ...campChoices.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Dropdown
          label="Thời gian"
          icon={CalendarDays}
          value={period}
          onChange={setPeriod}
          options={[
            { value: '1', label: 'Hôm nay' },
            { value: 'yesterday', label: 'Hôm qua' },
            { value: '3', label: '3 ngày gần đây' },
            { value: '7', label: '7 ngày gần đây' },
            { value: '14', label: '14 ngày gần đây' },
          ]}
        />
        <span className="filtered-count">
          Đã lọc: <strong>{accounts.length}</strong> acc / <strong>{campaigns.length}</strong> camp
        </span>
      </div>
      {data.accounts.some((a) => a.is_tracked && a.currency !== 'VND') && (
        <div className="notice">
          Tổng quan chỉ cộng tài khoản VND để không trộn tiền tệ. Báo cáo riêng hỗ trợ đơn vị tiền
          của tài khoản.
        </div>
      )}
      <div className="kpi-grid">
        {summary.map((s, i) => (
          <div className="kpi-card" key={s.key}>
            <div className="kpi-label">
              <span>{s.name}</span>
              <s.icon size={16} />
            </div>
            <div className="kpi-value">{format(stats[s.key], s.type)}</div>
            <div className="kpi-foot">
              <Trend
                value={previous[s.key] ? (stats[s.key] / previous[s.key] - 1) * 100 : null}
                inverse={s.inverse}
              />
              <span>so với kỳ trước</span>
            </div>
            {demo && selected.length > 0 && <MiniSpark index={i} />}
          </div>
        ))}
      </div>
      <div className="dashboard-main">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Hiệu suất theo thời gian</h2>
              <p>Chi tiêu và giá trị tạo ra trong cùng một góc nhìn</p>
            </div>
            <span className="date-label">
              {range.since.slice(8)}/{range.since.slice(5, 7)} — {range.until.slice(8)}/
              {range.until.slice(5, 7)}
            </span>
          </div>
          <Chart rows={selected} range={range} />
          <div className="chart-footer">
            <span>
              <Activity size={13} />
              {stats.conversions.toLocaleString('vi-VN')} lượt mua trong kỳ
            </span>
            <span>
              Đơn vị chi tiêu: VND <span className="separator">/</span> Nguồn:{' '}
              {demo ? 'Dữ liệu mẫu' : 'Meta Ads'}
            </span>
          </div>
        </section>
        <MetaAIInsights
          filters={{ bm, account, campaign: camp, status }}
          range={range}
          dataRevision={data.loadedAt}
          demo={demo}
          onManage={goMetaAI}
          request={analysisRequest}
          onBusyChange={setAIBusy}
          toast={toast}
        />
      </div>
      <section className="panel campaign-panel">
        <div className="panel-heading">
          <div className="table-title">
            <h2>Chiến dịch</h2>
            <span className="count-pill">{table.length}</span>
            <span className="muted">Theo dõi và tối ưu hiệu quả</span>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Tìm chiến dịch…" />
        </div>
        <div className="table-scroll">
          <table id="campaigns-table" className="campaign-table">
            <thead>
              <tr>
                <th className="name-col">Tên chiến dịch</th>
                <th>Ngân sách/ngày</th>
                {[
                  ['spend', 'Đã chi tiêu'],
                  ['conversions', 'Kết quả'],
                  ['cpa', 'CPA'],
                  ['ROAS', 'ROAS'],
                  ['ctr', 'CTR'],
                ].map(([key, label]) => (
                  <th key={key}>
                    <button
                      onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}
                    >
                      {label}
                      {sort.key === key ? <span>{sort.dir < 0 ? ' ↓' : ' ↑'}</span> : null}
                    </button>
                  </th>
                ))}
                <th>Trạng thái</th>
                <th aria-label="Hành động" />
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((c) => {
                const acc = data.accounts.find((a) => a.id === c.account_id);
                const tone =
                  c.status !== 'ACTIVE'
                    ? 'neutral'
                    : c.ROAS >= 3.5
                      ? 'positive'
                      : c.ROAS < 1.5 && c.spend
                        ? 'warning'
                        : 'running';
                const label =
                  c.status !== 'ACTIVE'
                    ? campaignStatusLabel(c.status)
                    : tone === 'positive'
                      ? 'Hiệu quả cao'
                      : tone === 'warning'
                        ? 'Cần tối ưu'
                        : 'Đang chạy';
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="campaign-name">
                        <span className={`campaign-glyph ${tone}`}>
                          <Layers3 size={16} />
                        </span>
                        <div>
                          <strong>{c.name}</strong>
                          <small>{acc?.name}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.daily_budget == null ? 'Theo nhóm QC' : format(c.daily_budget, 'money')}
                    </td>
                    <td className="strong">{format(c.spend, 'money')}</td>
                    <td>
                      {format(c.conversions)}
                      <small>Lượt mua</small>
                    </td>
                    <td>{format(c.cpa, 'money')}</td>
                    <td className={c.ROAS >= 3.5 ? 'text-green' : ''}>{format(c.ROAS, 'ratio')}</td>
                    <td>{format(c.ctr, 'percent')}</td>
                    <td>
                      <Badge tone={tone}>{label}</Badge>
                      {c.status === 'ACTIVE' && label !== 'Đang chạy' && <small>Đang chạy</small>}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Phân tích ${c.name}`}
                        disabled={aiBusy}
                        onClick={() => {
                          setCamp(c.id);
                          setAnalysisRequest((value) => value + 1);
                        }}
                      >
                        <Sparkles size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!table.length && (
            <Empty icon={Search} title="Chưa có chiến dịch phù hợp">
              Thử đổi bộ lọc hoặc kết nối tài khoản quảng cáo.
            </Empty>
          )}
        </div>
        <Pagination pagination={pagination} tableId="campaigns-table" label="chiến dịch" />
        <div className="table-footer">
          <span>
            Tổng {table.length} chiến dịch <span className="separator">•</span> Kết quả: Lượt mua
          </span>
          <span>CPA = Chi tiêu / Lượt mua</span>
        </div>
      </section>
      <div className="page-footer">
        <span>
          <span className="status-dot positive" />{' '}
          {demo ? 'Không gian dữ liệu mẫu' : 'Dữ liệu được bảo vệ trong workspace của bạn'}
        </span>
        <span>
          ADS HUB <span className="separator">/</span> MADE FOR MEDIA BUYERS
        </span>
      </div>
    </>
  );
}
