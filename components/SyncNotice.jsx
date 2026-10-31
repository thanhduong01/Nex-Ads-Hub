import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from './ui.jsx';
export default function SyncNotice({ progress, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="notice sync-notice" role="status">
      <RefreshCw size={16} className="spin" />
      <div>
        <strong>
          {progress.phase === 'planning'
            ? 'Đang kiểm tra dữ liệu cần làm mới…'
            : progress.phase === 'recent'
              ? 'Đang cập nhật số liệu mới nhất…'
              : 'Đang bổ sung lịch sử và trạng thái chiến dịch…'}
        </strong>
        <span>
          {progress.totalAccounts
            ? `${progress.completedAccounts || 0}/${progress.totalAccounts} tài khoản · ${progress.completedSteps || 0}/${progress.totalSteps} lượt hoàn tất. `
            : ''}
          Dữ liệu hiện ngay sau từng lượt; bạn vẫn có thể sử dụng ứng dụng.
        </span>
        {progress.totalSteps > 0 && (
          <progress
            max={progress.totalSteps}
            value={progress.completedSteps || 0}
            aria-label="Tiến độ đồng bộ"
          />
        )}
      </div>
      <span className="sync-elapsed" aria-hidden="true">
        {elapsed}s
      </span>
      <Button onClick={onCancel}>
        <X size={14} /> Dừng
      </Button>
    </div>
  );
}
