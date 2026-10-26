import { useEffect, useState } from 'react';
import {
  Sparkles,
  ExternalLink,
  Plus,
  Save,
  Trash2,
  Check,
  RefreshCw,
  Unplug,
  Copy,
} from 'lucide-react';
import { Button, Badge, Empty, Modal } from './ui.jsx';
import { api } from '../lib/api.js';
import { DEFAULT_AI_PROMPTS, META_AI_PORTAL, PROMPT_VARIABLES } from '../lib/aiPrompts.js';

export default function MetaAISettings({ demo, toast }) {
  const [settings, setSettings] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [label, setLabel] = useState('Meta AI của tôi'),
    [key, setKey] = useState(''),
    [model, setModel] = useState('auto');
  const [editor, setEditor] = useState(null),
    [action, setAction] = useState(''),
    [deleting, setDeleting] = useState(null);
  async function load(initial = false) {
    const result = demo
      ? {
          connection: { configured: false, models: [] },
          prompts: DEFAULT_AI_PROMPTS,
          activePromptId: DEFAULT_AI_PROMPTS[0].id,
        }
      : await api('/api/ai/settings');
    setSettings(result);
    if (initial) {
      setLabel(result.connection.label || 'Meta AI của tôi');
      setModel(result.connection.model || 'auto');
      setEditor(
        result.prompts.find((prompt) => prompt.id === result.activePromptId) ||
          result.prompts[0] ||
          null,
      );
    }
    return result;
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (active) await load(true);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [demo]);
  async function perform(name, work) {
    setAction(name);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e.message);
      toast(e.message, 'error');
    } finally {
      setAction('');
    }
  }
  async function connect(event) {
    event.preventDefault();
    await perform('connection', async () => {
      const result = await api('/api/ai/connection', {
        method: 'POST',
        body: JSON.stringify({ label, apiKey: key, model }),
      });
      setSettings(result);
      setModel(result.connection.model);
      setKey('');
      toast('Đã xác minh khóa và lưu kết nối Meta AI.');
    });
  }
  async function savePrompt(event) {
    event.preventDefault();
    await perform('prompt', async () => {
      const saved = await api('/api/ai/prompts', { method: 'POST', body: JSON.stringify(editor) });
      await load();
      setEditor(saved);
      toast('Đã lưu prompt. Lượt phân tích tiếp theo sẽ dùng nội dung mới.');
    });
  }
  const disabled = demo || Boolean(action);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE / TRỢ LÝ PHÂN TÍCH</div>
          <h1>
            Meta AI & prompt<span className="heading-dot">.</span>
          </h1>
          <p>Kết nối model của bạn và viết yêu cầu cho mỗi lần phân tích quảng cáo.</p>
        </div>
        <a className="btn" href={META_AI_PORTAL} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} /> Đăng nhập Meta Model API
        </a>
      </div>
      {demo && (
        <div className="notice">
          Đây là giao diện mẫu. Đăng nhập workspace thật để kết nối Meta AI và lưu prompt.
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <Button disabled={Boolean(action)} onClick={() => perform('reload', () => load(true))}>
            Thử tải lại
          </Button>
        </div>
      )}
      {loading ? (
        <p role="status">Đang tải cấu hình Meta AI…</p>
      ) : (
        settings && (
          <>
            <section className="panel ai-connection-panel">
              <div className="panel-heading">
                <h2>
                  <Sparkles size={17} /> Kết nối Meta AI
                </h2>
                <Badge
                  tone={
                    settings.connection.verifiedAt && settings.connection.configured
                      ? 'positive'
                      : 'warning'
                  }
                >
                  {settings.connection.verifiedAt && settings.connection.configured
                    ? 'Đã xác minh khóa'
                    : 'Chưa kết nối'}
                </Badge>
              </div>
              <form onSubmit={connect} className="ai-connection-form">
                <label className="field">
                  Tên kết nối
                  <input
                    maxLength={100}
                    required
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    disabled={disabled}
                  />
                </label>
                <label className="field">
                  API key
                  <input
                    type="password"
                    autoComplete="new-password"
                    maxLength={8192}
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder={
                      settings.connection.configured
                        ? 'Đã có khóa · để trống để giữ khóa'
                        : 'Nhập API key từ Meta Model API'
                    }
                    disabled={disabled}
                  />
                </label>
                <label className="field">
                  Model
                  <select
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    disabled={disabled}
                  >
                    <option value="auto">Tự động chọn model khả dụng</option>
                    {[
                      ...new Set([
                        ...(settings.connection.models || []),
                        ...(settings.connection.model && settings.connection.model !== 'auto'
                          ? [settings.connection.model]
                          : []),
                      ]),
                    ].map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ai-connection-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    busy={action === 'connection'}
                    disabled={disabled || (!settings.connection.configured && !key.trim())}
                  >
                    <Check size={15} /> Kiểm tra & kết nối
                  </Button>
                  {settings.connection.configured && (
                    <Button
                      variant="danger-quiet"
                      disabled={disabled}
                      onClick={() =>
                        perform('disconnect', async () => {
                          await api('/api/ai/connection', { method: 'DELETE' });
                          await load(true);
                          setKey('');
                          toast('Đã ngắt kết nối Meta AI.');
                        })
                      }
                    >
                      <Unplug size={15} /> Ngắt kết nối
                    </Button>
                  )}
                </div>
              </form>
              <div className="ai-connection-help">
                {settings.connection.issue && (
                  <p className="text-orange" role="alert">
                    {settings.connection.issue}
                  </p>
                )}
                <p>
                  Đăng nhập cổng Meta ở nút phía trên → API keys → Create API key, rồi nhập khóa tại
                  đây. Ads Hub dùng Meta Model API để phân tích; phiên Facebook Ads và phiên đăng
                  nhập trang Meta AI được quản lý riêng.
                </p>
                <p>
                  Khóa được mã hóa trên máy chủ. Tên kết nối do bạn đặt; trạng thái xác minh xác
                  nhận khóa hợp lệ và có model khả dụng.
                </p>
                {settings.connection.verifiedAt && (
                  <p>
                    Kiểm tra gần nhất:{' '}
                    {new Date(settings.connection.verifiedAt).toLocaleString('vi-VN')} · Model:{' '}
                    <strong>{settings.connection.model}</strong>
                  </p>
                )}
                <a
                  href="https://dev.meta.ai/docs/authentication"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Hướng dẫn tạo khóa của Meta <ExternalLink size={12} />
                </a>
              </div>
            </section>
            <section className="panel ai-prompts-panel">
              <div className="panel-heading">
                <div>
                  <h2>Thư viện prompt</h2>
                  <p>Chọn yêu cầu mặc định, hoặc chọn một prompt khác ngay ở nút phân tích.</p>
                </div>
                <Button disabled={disabled} onClick={() => setEditor({ name: '', content: '' })}>
                  <Plus size={15} /> Tạo prompt
                </Button>
              </div>
              <div className="ai-prompts-layout">
                <div className="ai-prompt-list" aria-label="Danh sách prompt">
                  {settings.prompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      className={editor?.id === prompt.id ? 'active' : ''}
                      onClick={() => setEditor({ ...prompt })}
                      disabled={Boolean(action)}
                    >
                      <span>{prompt.name}</span>
                      {settings.activePromptId === prompt.id && (
                        <Badge tone="positive">Mặc định</Badge>
                      )}
                      <small>
                        {prompt.updatedAt
                          ? `Đã lưu ${new Date(prompt.updatedAt).toLocaleString('vi-VN')}`
                          : 'Prompt khởi đầu · có thể chỉnh sửa'}
                      </small>
                    </button>
                  ))}
                  {!settings.prompts.length && <p>Chưa có prompt. Tạo yêu cầu đầu tiên của bạn.</p>}
                </div>
                {editor ? (
                  <form className="ai-prompt-editor" onSubmit={savePrompt}>
                    <label className="field">
                      Tên prompt
                      <input
                        required
                        maxLength={100}
                        value={editor.name}
                        onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                        disabled={disabled}
                      />
                    </label>
                    <label className="field">
                      Yêu cầu phân tích
                      <textarea
                        required
                        minLength={20}
                        maxLength={20000}
                        rows={15}
                        value={editor.content}
                        onChange={(event) => setEditor({ ...editor, content: event.target.value })}
                        disabled={disabled}
                        placeholder="Mục tiêu, chỉ số ưu tiên, điều kiện đề xuất và cách trình bày bạn mong muốn…"
                      />
                    </label>
                    <div className="ai-prompt-variables">
                      <span>Chèn dữ liệu từ bộ lọc:</span>
                      {Object.entries(PROMPT_VARIABLES).map(([name, description]) => (
                        <button
                          type="button"
                          key={name}
                          title={description}
                          disabled={disabled}
                          onClick={() =>
                            setEditor({ ...editor, content: `${editor.content}{{${name}}}` })
                          }
                        >{`{{${name}}}`}</button>
                      ))}
                    </div>
                    <div className="ai-prompt-actions">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={disabled}
                        busy={action === 'prompt'}
                      >
                        <Save size={15} /> Lưu prompt
                      </Button>
                      {editor.id && (
                        <>
                          <Button
                            disabled={disabled || settings.activePromptId === editor.id}
                            onClick={() =>
                              perform('activate', async () => {
                                await api('/api/ai/prompts', {
                                  method: 'PATCH',
                                  body: JSON.stringify({ id: editor.id }),
                                });
                                await load();
                                toast('Đã chọn prompt mặc định.');
                              })
                            }
                          >
                            <Check size={15} /> Dùng mặc định
                          </Button>
                          <Button
                            disabled={disabled}
                            onClick={() =>
                              setEditor({
                                name: `${editor.name} (bản sao)`.slice(0, 100),
                                content: editor.content,
                              })
                            }
                          >
                            <Copy size={15} /> Nhân bản
                          </Button>
                          <Button
                            variant="danger-quiet"
                            disabled={disabled}
                            onClick={() => setDeleting(editor)}
                          >
                            <Trash2 size={15} /> Xóa
                          </Button>
                        </>
                      )}
                    </div>
                    <p className="field-hint">
                      Lưu thay đổi trước khi phân tích. Prompt được lưu riêng trong workspace và
                      được đọc lại mỗi lần bấm phân tích.
                    </p>
                  </form>
                ) : (
                  <Empty icon={Sparkles} title="Viết yêu cầu phân tích của bạn">
                    Tạo một prompt hoặc chọn prompt bên trái để chỉnh sửa.
                  </Empty>
                )}
              </div>
            </section>
          </>
        )
      )}
      {deleting && (
        <Modal
          title="Xóa prompt?"
          subtitle={deleting.name}
          onClose={() => !action && setDeleting(null)}
        >
          <p>
            Lượt phân tích tiếp theo sẽ không dùng được prompt này. Nếu đây là prompt mặc định, ứng
            dụng sẽ chọn prompt còn lại.
          </p>
          <div className="modal-actions">
            <Button disabled={Boolean(action)} onClick={() => setDeleting(null)}>
              Hủy
            </Button>
            <Button
              variant="danger-quiet"
              busy={action === 'delete'}
              onClick={() =>
                perform('delete', async () => {
                  await api('/api/ai/prompts', {
                    method: 'DELETE',
                    body: JSON.stringify({ id: deleting.id }),
                  });
                  const result = await load();
                  setEditor(result.prompts[0] || null);
                  setDeleting(null);
                  toast('Đã xóa prompt.');
                })
              }
            >
              Xóa prompt
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
