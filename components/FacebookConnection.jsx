import { useEffect, useState } from 'react';
import { RefreshCw, Facebook } from 'lucide-react';
import { Button, Badge } from './ui.jsx';
import { api } from '../lib/api.js';

const typeLabel = (type) =>
  ({ SYSTEM_USER: 'System User', USER: 'Người dùng Facebook', PAGE: 'Trang Facebook' })[type] ||
  'Chưa xác định loại token';

export default function FacebookConnection({ revision, demo }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (demo) return;
    let active = true;
    setLoading(true);
    setError('');
    api('/api/facebook/connection')
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setResult(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, demo, attempt]);

  return (
    <section className="panel connection-panel">
      <div className="panel-heading">
        <h2>
          <Facebook size={16} /> Nguồn kết nối Facebook
        </h2>
        {!demo && (
          <Button busy={loading} onClick={() => setAttempt((value) => value + 1)}>
            <RefreshCw size={14} />
            Kiểm tra lại
          </Button>
        )}
      </div>
      <div className="connection-details">
        {demo ? (
          <p>Đang dùng dữ liệu mẫu, chưa kết nối Facebook thật.</p>
        ) : (
          <>
            {loading && <p role="status">Đang xác minh danh tính token với Meta…</p>}
            {error && (
              <p role="alert" className="text-orange">
                {error}
              </p>
            )}
            {!loading && result?.connections.length === 0 && (
              <p>Chưa có tài khoản Facebook được kết nối với workspace.</p>
            )}
            {result?.connections.map((connection, index) => (
              <article key={index}>
                <div className="connection-identity">
                  <strong>{connection.identity?.name || 'Chưa xác minh danh tính'}</strong>
                  <Badge>{typeLabel(connection.identity?.type)}</Badge>
                </div>
                <dl>
                  <div>
                    <dt>ID nguồn Meta</dt>
                    <dd className="mono">
                      {connection.identity?.id || connection.storedIdentityIds.join(', ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Ứng dụng cấp token</dt>
                    <dd>
                      {connection.identity?.appName || 'Chưa xác minh'}
                      {connection.identity?.appId && (
                        <small className="mono">{connection.identity.appId}</small>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Cách kết nối</dt>
                    <dd>
                      {connection.source === 'server_token'
                        ? 'Token máy chủ · META_ACCESS_TOKEN'
                        : 'Token đã lưu mã hóa'}
                    </dd>
                  </div>
                  <div>
                    <dt>Tài khoản đã lưu từ nguồn này</dt>
                    <dd>{connection.accountCount}</dd>
                  </div>
                </dl>
                {connection.error && (
                  <p role="alert" className="text-orange">
                    {connection.error}
                  </p>
                )}
                {connection.warning && (
                  <p role="alert" className="text-orange">
                    {connection.warning}
                  </p>
                )}
                {connection.identity?.type === 'SYSTEM_USER' && (
                  <p>
                    Đây là System User do doanh nghiệp cấp quyền. Danh sách BM và tài khoản được đọc
                    theo các tài sản đã gán cho System User này.
                  </p>
                )}
                {connection.source === 'server_token' && (
                  <p>
                    Nguồn được chọn bằng token cấu hình trên máy chủ; việc đổi Facebook đang đăng
                    nhập trong trình duyệt không đổi nguồn này.
                  </p>
                )}
              </article>
            ))}
            {result?.checkedAt && (
              <p className="field-hint">
                Kiểm tra lúc {new Date(result.checkedAt).toLocaleString('vi-VN')}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
