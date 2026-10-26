import { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowRight, Settings2, Copy, RefreshCw } from 'lucide-react';
import { Button, Dropdown, Badge } from './ui.jsx';
import { api } from '../lib/api.js';
import { DEFAULT_AI_PROMPTS } from '../lib/aiPrompts.js';

export default function MetaAIInsights({
  filters,
  range,
  dataRevision,
  demo,
  onManage,
  request,
  onBusyChange,
  toast,
}) {
  const [settings, setSettings] = useState(null),
    [promptId, setPromptId] = useState(''),
    [targetCPA, setTargetCPA] = useState(150000);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState(null);
  const run = useRef(0),
    mounted = useRef(true),
    busyRef = useRef(false);
  const scopeKey = JSON.stringify([filters, range, promptId, targetCPA, dataRevision]);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const value = demo
        ? {
            connection: { configured: false },
            prompts: DEFAULT_AI_PROMPTS,
            activePromptId: DEFAULT_AI_PROMPTS[0].id,
          }
        : await api('/api/ai/settings');
      if (!mounted.current) return;
      setSettings(value);
      setPromptId((id) =>
        value.prompts.some((prompt) => prompt.id === id) ? id : value.activePromptId,
      );
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      run.current++;
      onBusyChange(false);
    };
  }, [demo]);
  useEffect(() => {
    run.current++;
    setResult(null);
    setError('');
  }, [scopeKey]);
  const prompt = settings?.prompts.find((item) => item.id === promptId);
  const ready =
    !demo && settings?.connection.configured && settings.connection.verifiedAt && prompt;
  async function analyze() {
    if (busyRef.current) return;
    if (!ready) {
      setError('Kết nối Meta AI và chọn prompt trước khi phân tích.');
      return;
    }
    const id = ++run.current;
    busyRef.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setResult(null);
    try {
      const value = await api('/api/ai/analyze', {
        method: 'POST',
        timeoutMs: 125000,
        body: JSON.stringify({ filters, range, promptId, targetCPA }),
      });
      if (mounted.current && run.current === id) setResult(value);
    } catch (e) {
      if (mounted.current && run.current === id) {
        setError(e.message);
        toast(e.message, 'error');
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  useEffect(() => {
    if (request > 0) void analyze();
  }, [request]);
  return (
    <>
      <aside className="panel insight-panel ai-live-panel">
        <div className="panel-heading">
          <div className="insight-title">
            <span className="ai-icon">
              <Sparkles size={17} />
            </span>
            <h2>Meta AI Insights</h2>
          </div>
          <Badge tone={ready ? 'positive' : 'warning'}>
            {ready ? 'Đã kết nối' : demo ? 'Dữ liệu mẫu' : 'Chưa kết nối'}
          </Badge>
        </div>
        <div className="ai-live-controls">
          <p>Phân tích dữ liệu đang lọc theo yêu cầu của bạn.</p>
          {loading ? (
            <p role="status">Đang tải prompt…</p>
          ) : (
            <Dropdown
              label="Prompt phân tích"
              value={promptId}
              disabled={busy || !settings?.prompts.length}
              onChange={setPromptId}
              options={(settings?.prompts || []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          )}
          {prompt && (
            <details className="ai-prompt-preview">
              <summary>Xem yêu cầu sẽ sử dụng</summary>
              <p>{prompt.content}</p>
            </details>
          )}
          <label className="field">
            CPA mục tiêu (VND)
            <input
              type="number"
              min="1"
              max="1000000000000"
              value={targetCPA}
              disabled={busy}
              onChange={(event) => setTargetCPA(Math.max(1, Number(event.target.value)))}
            />
          </label>
          {settings?.connection.model && settings.connection.model !== 'auto' && (
            <small>Model: {settings.connection.model}</small>
          )}
          {demo && <p>Đăng nhập workspace thật để dùng Meta AI.</p>}
          {!demo && !loading && !ready && (
            <p>Kết nối tài khoản Meta Model API và lưu prompt để bắt đầu.</p>
          )}
          {error && (
            <p className="text-orange" role="alert">
              {error}
            </p>
          )}
          {busy && <p role="status">Đang gửi prompt và chờ Meta AI trả kết quả…</p>}
        </div>
        <Button variant="ai" disabled={loading || !ready} busy={busy} onClick={analyze}>
          <Sparkles size={15} />
          {busy
            ? 'Đang phân tích…'
            : result
              ? 'Phân tích lại bằng Meta AI'
              : 'Phân tích bằng Meta AI'}
          <ArrowRight size={15} />
        </Button>
        <div className="ai-live-actions">
          <Button onClick={onManage}>
            <Settings2 size={14} /> Quản lý Meta AI & prompt
          </Button>
          {!loading && (
            <button
              type="button"
              disabled={busy}
              className="icon-button"
              aria-label="Tải lại cấu hình Meta AI"
              onClick={load}
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </aside>
      {result && (
        <section className="panel ai-results ai-live-results">
          <div className="panel-heading">
            <div>
              <h2>
                <Sparkles size={16} /> Đề xuất từ Meta AI
              </h2>
              <p>
                {result.prompt.name} · {result.model} ·{' '}
                {new Date(result.createdAt).toLocaleString('vi-VN')}
              </p>
            </div>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.text);
                  toast('Đã sao chép phân tích.');
                } catch {
                  toast('Không sao chép được. Bạn có thể chọn nội dung để sao chép.', 'error');
                }
              }}
            >
              <Copy size={14} /> Sao chép
            </Button>
          </div>
          <div className="ai-result-scope">
            {result.scope.accountCount} tài khoản · {result.scope.campaignCount} chiến dịch ·{' '}
            {result.scope.range.since} → {result.scope.range.until}
            <span>
              Đã gửi số liệu của {result.scope.campaignsWithInsights} chiến dịch;{' '}
              {result.scope.campaignsWithoutInsights} chiến dịch không có insight trong cả hai kỳ.
            </span>
          </div>
          {result.incomplete && (
            <div className="notice yellow">
              Kết quả đạt giới hạn độ dài. Thu hẹp bộ lọc hoặc yêu cầu nội dung ngắn hơn trong
              prompt để có câu trả lời đầy đủ.
            </div>
          )}
          <div className="ai-response">{result.text}</div>
          <details className="ai-request-snapshot">
            <summary>Prompt đã gửi trong lượt này</summary>
            <p>{result.prompt.content}</p>
          </details>
          {!!result.usage.total_tokens && (
            <p className="ai-usage">
              Meta báo sử dụng {result.usage.total_tokens.toLocaleString('vi-VN')} token trong lượt
              này.
            </p>
          )}
        </section>
      )}
    </>
  );
}
