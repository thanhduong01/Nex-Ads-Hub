import { useState } from 'react';
import {
  Building2,
  Plus,
  RefreshCw,
  Unplug,
  Search,
  Wallet,
  ShieldCheck,
  ArrowUpRight,
  Facebook,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Button, Badge, SearchInput, Empty, Modal } from './ui.jsx';
import { aggregate, format, todayISO } from '../lib/metrics.js';
import FacebookConnection from './FacebookConnection.jsx';
import Pagination, { usePagination } from './Pagination.jsx';
export default function Accounts({
  data,
  connect,
  disconnect,
  toggle,
  sync,
  busy,
  toast,
  demo,
  oauth,
  status,
}) {
  const [query, setQuery] = useState(''),
    [modal, setModal] = useState(''),
    [connecting, setConnecting] = useState(false);
  const oauthUnavailable = !demo && status?.oauth === false;
  const tokenUnavailable = !demo && status?.metaToken === false;
  const accounts = data.accounts.filter((a) =>
    `${a.name} ${a.id} ${data.bms.find((b) => b.id === a.bm_id)?.name || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pagination = usePagination(accounts, query);
  async function connectSystem() {
    setConnecting(true);
    try {
      await connect();
      setModal('');
      // Account discovery is complete; spend sync runs without holding this dialog open.
      void sync();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setConnecting(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE / KẾT NỐI META</div>
          <h1>
            Tài khoản quảng cáo<span className="heading-dot">.</span>
          </h1>
          <p>Quản lý Business Manager và các tài khoản trong cùng workspace.</p>
        </div>
        <Button variant="facebook" onClick={() => setModal('connect')}>
          <Facebook size={16} />
          Kết nối Facebook
        </Button>
      </div>
      <FacebookConnection revision={data.loadedAt} demo={demo} />
      <div className="account-summary">
        <div>
          <span className="summary-icon">
            <Building2 size={22} />
          </span>
          <div>
            <strong>{data.bms.length}</strong>
            <span>Business Manager</span>
          </div>
        </div>
        <div>
          <span className="summary-icon">
            <Wallet size={22} />
          </span>
          <div>
            <strong>{data.accounts.length}</strong>
            <span>Tài khoản quảng cáo</span>
          </div>
        </div>
        <div>
          <span className="summary-icon green">
            <ShieldCheck size={22} />
          </span>
          <div>
            <strong>{data.accounts.filter((a) => a.is_tracked).length}</strong>
            <span>Đang theo dõi</span>
          </div>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div className="table-title">
            <h2>Tất cả tài khoản</h2>
            <span className="count-pill">{accounts.length}</span>
          </div>
          <div className="heading-actions">
            <SearchInput value={query} onChange={setQuery} placeholder="Tìm tên, ID hoặc BM…" />
            <Button busy={busy || connecting} onClick={connectSystem}>
              <RefreshCw size={14} />
              Đồng bộ lại
            </Button>
            {data.accounts.length > 0 && (
              <Button variant="danger-quiet" onClick={() => setModal('disconnect')}>
                <Unplug size={14} />
                Ngắt kết nối
              </Button>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <table id="accounts-table">
            <thead>
              <tr>
                <th>BM sở hữu</th>
                <th>Tài khoản quảng cáo</th>
                <th>Trạng thái</th>
                <th>Vai trò</th>
                <th>Số dư cần thanh toán*</th>
                <th>Chi tiêu tháng</th>
                <th>Theo dõi</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((a) => {
                const bm = data.bms.find((b) => b.id === a.bm_id);
                const month = todayISO().slice(0, 7);
                const spend = aggregate(
                  data.rows.filter((r) => r.account_id === a.id && r.date.startsWith(month)),
                ).spend;
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="bm-cell">
                        <Building2 size={16} />
                        {bm?.name || 'Chưa xác định BM'}
                      </div>
                    </td>
                    <td>
                      <strong>{a.name}</strong>
                      <small className="mono">{a.id}</small>
                      {a.last_sync_error && (
                        <small className="text-orange" title={a.last_sync_error}>
                          Đồng bộ lỗi — thử lại
                        </small>
                      )}
                    </td>
                    <td>
                      <Badge tone={a.account_status === 1 ? 'positive' : 'warning'}>
                        {a.account_status === 1 ? 'Hoạt động' : `Hạn chế (${a.account_status})`}
                      </Badge>
                    </td>
                    <td>
                      <span className="role-label">{a.role}</span>
                    </td>
                    <td>{format(a.balance, 'money', a.currency)}</td>
                    <td>{format(spend, 'money', a.currency)}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          aria-label={`Theo dõi ${a.name}`}
                          checked={a.is_tracked}
                          onChange={(e) => toggle(a.id, e.target.checked)}
                        />
                        <span />
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!accounts.length && (
            <Empty
              icon={Wallet}
              title={query ? 'Không tìm thấy tài khoản' : 'Kết nối tài khoản đầu tiên'}
              action={
                !query && (
                  <Button variant="facebook" onClick={() => setModal('connect')}>
                    <Facebook size={15} />
                    Kết nối Facebook — Tự kéo BM & TKQC
                  </Button>
                )
              }
            >
              {query
                ? 'Thử từ khóa khác.'
                : 'Ads Hub sẽ tự lấy Business Manager, tài khoản sở hữu và tài khoản được chia sẻ.'}
            </Empty>
          )}
        </div>
        <Pagination pagination={pagination} tableId="accounts-table" label="tài khoản quảng cáo" />
        <div className="table-footer">
          <span>* Balance từ Meta là số dư cần thanh toán, không mặc định là tiền còn lại.</span>
          <Button onClick={() => sync()} busy={busy}>
            <RefreshCw size={13} />
            Đồng bộ chi tiêu
          </Button>
        </div>
      </section>
      <div className="connection-note">
        <ShieldCheck size={20} />
        <div>
          <h3>Kết nối một lần, tiếp tục ở bất kỳ đâu.</h3>
          <p>
            Tài khoản được lưu trong Supabase. Token Facebook chỉ được xử lý trên máy chủ; F5 không
            cần kết nối lại.
          </p>
        </div>
      </div>
      {modal === 'connect' && (
        <Modal
          title="Kết nối Facebook"
          subtitle="Tự kéo Business Manager và tài khoản quảng cáo bạn có quyền truy cập."
          onClose={() => !connecting && setModal('')}
        >
          <div className="connect-steps">
            {[
              oauthUnavailable
                ? 'Kết nối bằng token đã cấu hình'
                : 'Đăng nhập Facebook và cấp quyền',
              'Lấy danh sách Business Manager',
              'Đồng bộ tài khoản quảng cáo',
            ].map((s, i) => (
              <div key={s}>
                <span>{i + 1}</span>
                <p>{s}</p>
              </div>
            ))}
          </div>
          <Button
            variant="facebook full"
            disabled={connecting || oauthUnavailable}
            onClick={() => {
              setModal('');
              oauth();
            }}
          >
            <Facebook size={17} />
            Tiếp tục với Facebook
            <ExternalLink size={14} />
          </Button>
          {oauthUnavailable && (
            <p className="field-hint" role="status">
              {status.oauthIssue || 'Cần hoàn tất cấu hình Facebook OAuth trên máy chủ.'}
            </p>
          )}
          <div className="or-divider">
            <span>hoặc dùng token máy chủ</span>
          </div>
          <Button
            className="full"
            variant={oauthUnavailable ? 'primary' : ''}
            busy={connecting}
            disabled={tokenUnavailable}
            onClick={connectSystem}
          >
            <RefreshCw size={15} />
            {connecting ? 'Đang lấy BM & tài khoản…' : 'Kết nối bằng System User Token'}
          </Button>
          <p className="field-hint">
            {demo
              ? 'Bạn đang ở chế độ mẫu. Kết nối này chỉ tạo dữ liệu minh họa.'
              : tokenUnavailable
                ? 'Chưa có token máy chủ. Thêm META_ACCESS_TOKEN vào cấu hình để dùng cách kết nối này.'
                : 'System User Token lấy từ cấu hình máy chủ, dùng được khi chạy local. OAuth cần địa chỉ HTTPS và quyền Meta App phù hợp.'}
          </p>
        </Modal>
      )}
      {modal === 'disconnect' && (
        <Modal title="Ngắt kết nối Facebook?" onClose={() => setModal('')}>
          <p className="modal-copy">
            Thao tác này xóa BM, tài khoản và dữ liệu chiến dịch đã đồng bộ khỏi Ads Hub. Khách hàng
            và cấu hình báo cáo được giữ lại. Quảng cáo trên Meta không bị thay đổi.
          </p>
          <div className="modal-actions">
            <Button onClick={() => setModal('')}>Hủy</Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                await disconnect();
                setModal('');
              }}
            >
              Ngắt kết nối
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
