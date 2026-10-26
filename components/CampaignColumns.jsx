import { useEffect, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  RotateCcw,
  Save,
  Calculator,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button, Modal, SearchInput } from './ui.jsx';
import { api } from '../lib/api.js';
import {
  CAMPAIGN_COLUMNS,
  CAMPAIGN_METRIC_KEYS,
  DEFAULT_CAMPAIGN_COLUMNS,
  campaignColumnDefinitions,
  validateCampaignColumns,
  validateCampaignMetric,
} from '../lib/campaignColumns.js';
const fresh = () => structuredClone(DEFAULT_CAMPAIGN_COLUMNS);
const DEMO_KEY = 'ads_hub_demo_campaign_columns';

export function useCampaignColumns(demo) {
  const [config, setConfig] = useState(fresh),
    [loading, setLoading] = useState(true),
    [issue, setIssue] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setIssue('');
    setConfig(fresh());
    (async () => {
      try {
        const cached = demo ? localStorage.getItem(DEMO_KEY) : null;
        const value = demo
          ? cached
            ? JSON.parse(cached)
            : fresh()
          : (await api('/api/preferences/campaign-columns')).config;
        const valid = validateCampaignColumns(value);
        if (active) setConfig(valid);
      } catch (error) {
        if (active) setIssue(error.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [demo]);
  async function save(input) {
    let next = validateCampaignColumns(input);
    if (demo) {
      try {
        localStorage.setItem(DEMO_KEY, JSON.stringify(next));
      } catch {
        throw new Error(
          'Không lưu được tùy chọn trong trình duyệt. Kiểm tra quyền lưu dữ liệu rồi thử lại.',
        );
      }
    } else
      next = (
        await api('/api/preferences/campaign-columns', {
          method: 'PUT',
          body: JSON.stringify(next),
        })
      ).config;
    setConfig(next);
    setIssue('');
    return next;
  }
  return { config, loading, issue, save };
}

export default function CampaignColumns({ config, onSave, onClose, demo, issue }) {
  const [draft, setDraft] = useState(() => structuredClone(config)),
    [query, setQuery] = useState(''),
    [editor, setEditor] = useState(null),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const selected = campaignColumnDefinitions(draft);
  const available = [
    ...Object.entries(CAMPAIGN_COLUMNS).map(([key, value]) => ({ key, ...value })),
    ...draft.custom_metrics.map((metric) => ({
      key: metric.id,
      name: metric.name,
      group: 'Chỉ số tùy chỉnh',
    })),
  ];
  const matching = available.filter((column) =>
    `${column.name} ${column.key} ${draft.custom_names[column.key] || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function toggle(key) {
    setDraft((value) => ({
      ...value,
      selected_columns: value.selected_columns.includes(key)
        ? value.selected_columns.filter((id) => id !== key)
        : [...value.selected_columns, key],
    }));
  }
  function move(index, offset) {
    const keys = [...draft.selected_columns];
    [keys[index], keys[index + offset]] = [keys[index + offset], keys[index]];
    setDraft({ ...draft, selected_columns: keys });
  }
  function rename(key, name) {
    setDraft((value) =>
      key.startsWith('custom_')
        ? {
            ...value,
            custom_metrics: value.custom_metrics.map((metric) =>
              metric.id === key ? { ...metric, name } : metric,
            ),
          }
        : { ...value, custom_names: { ...value.custom_names, [key]: name } },
    );
  }
  function newMetric() {
    if (draft.custom_metrics.length >= 12) {
      setError('Tối đa 12 chỉ số tùy chỉnh.');
      return;
    }
    setEditor({
      id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: '',
      left: 'purchase_value',
      operator: '/',
      rightType: 'metric',
      right: 'spend',
      type: 'ratio',
    });
    setError('');
  }
  function saveMetric(event) {
    event.preventDefault();
    try {
      const metric = validateCampaignMetric(editor);
      setDraft((value) => ({
        ...value,
        custom_metrics: [...value.custom_metrics.filter((item) => item.id !== metric.id), metric],
        selected_columns: value.selected_columns.includes(metric.id)
          ? value.selected_columns
          : [...value.selected_columns, metric.id],
      }));
      setEditor(null);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  async function save() {
    setSaving(true);
    setError('');
    try {
      await onSave(validateCampaignColumns(draft));
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title="Tùy chỉnh cột chiến dịch"
      subtitle="Chọn chỉ số, đổi tên và sắp xếp theo cách bạn đọc hiệu quả quảng cáo."
      wide
      className="campaign-columns-modal"
      onClose={() => !saving && onClose()}
    >
      {issue && (
        <p className="notice yellow">
          {issue} Bảng đang dùng bố cục mặc định; bạn có thể khôi phục và lưu lại tại đây.
        </p>
      )}
      <div className="column-controls">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Tìm thông tin hoặc chỉ số Meta…"
        />
        <Button
          disabled={saving}
          onClick={() => {
            setDraft(fresh());
            setEditor(null);
            setError('');
          }}
        >
          <RotateCcw size={15} /> Khôi phục mặc định
        </Button>
      </div>
      <div className="columns-layout">
        <section className="columns-catalog" aria-label="Thông tin và chỉ số có sẵn">
          <h3>Thông tin & chỉ số có sẵn</h3>
          <p>
            Các chỉ số từ dữ liệu Meta đã đồng bộ và các tỷ lệ tính lại theo khoảng ngày đang lọc.
          </p>
          {[...new Set(matching.map((column) => column.group))].map((group) => (
            <div className="column-group" key={group}>
              <h4>{group}</h4>
              {matching
                .filter((column) => column.group === group)
                .map((column) => (
                  <label key={column.key}>
                    <input
                      type="checkbox"
                      checked={draft.selected_columns.includes(column.key)}
                      disabled={saving}
                      onChange={() => toggle(column.key)}
                    />
                    <span>
                      {column.name}
                      <small>{column.key}</small>
                    </span>
                  </label>
                ))}
            </div>
          ))}
          {!matching.length && <p>Không có chỉ số phù hợp từ khóa.</p>}
          <Button disabled={saving} onClick={newMetric}>
            <Plus size={15} /> Tạo chỉ số công thức
          </Button>
        </section>
        <section className="columns-selected" aria-label="Cột được chọn và tên hiển thị">
          <h3>{selected.length} cột đang chọn</h3>
          <p>Đổi tên bên dưới. Dùng mũi tên để thay đổi thứ tự.</p>
          <ol>
            {selected.map((column, index) => (
              <li key={column.key}>
                <span className="column-position">{index + 1}</span>
                <label>
                  <span className="sr-only">
                    Tên hiển thị {CAMPAIGN_COLUMNS[column.key]?.name || column.name}
                  </span>
                  <input
                    maxLength={60}
                    value={draft.custom_names[column.key] ?? column.name}
                    placeholder={CAMPAIGN_COLUMNS[column.key]?.name || 'Tên chỉ số'}
                    disabled={saving}
                    onChange={(event) => rename(column.key, event.target.value)}
                  />
                  <small>{column.key}</small>
                </label>
                <div className="column-order">
                  <button
                    type="button"
                    className="icon-button"
                    disabled={saving || index === 0}
                    aria-label={`Di chuyển ${column.name} lên`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={saving || index === selected.length - 1}
                    aria-label={`Di chuyển ${column.name} xuống`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={saving}
                    aria-label={`Ẩn cột ${column.name}`}
                    onClick={() => toggle(column.key)}
                  >
                    <X size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {!selected.length && <p>Chọn ít nhất một cột ở danh mục bên trái.</p>}
          {draft.custom_metrics.length > 0 && (
            <div className="column-custom-list">
              <h4>Chỉ số công thức đã tạo</h4>
              {draft.custom_metrics.map((metric) => (
                <div key={metric.id}>
                  <span>
                    {metric.name}
                    <small>
                      {metric.left} {metric.operator} {metric.right}
                    </small>
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={saving}
                    aria-label={`Sửa công thức ${metric.name}`}
                    onClick={() => {
                      setEditor({ ...metric });
                      setError('');
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={saving}
                    aria-label={`Xóa chỉ số ${metric.name}`}
                    onClick={() => {
                      setDraft({
                        ...draft,
                        selected_columns: draft.selected_columns.filter((key) => key !== metric.id),
                        custom_metrics: draft.custom_metrics.filter(
                          (item) => item.id !== metric.id,
                        ),
                      });
                      if (editor?.id === metric.id) setEditor(null);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {editor && (
        <form className="column-formula-editor" onSubmit={saveMetric}>
          <h3>
            <Calculator size={16} /> Công thức từ chỉ số Meta Ads
          </h3>
          <div className="column-formula-grid">
            <label className="field">
              Tên chỉ số
              <input
                required
                maxLength={60}
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </label>
            <label className="field">
              Định dạng
              <select
                value={editor.type}
                onChange={(event) => setEditor({ ...editor, type: event.target.value })}
              >
                <option value="number">Số</option>
                <option value="money">Tiền tệ (VND)</option>
                <option value="ratio">Tỷ lệ (×)</option>
                <option value="percent">Phần trăm (%)</option>
              </select>
            </label>
            <label className="field">
              Chỉ số thứ nhất
              <select
                value={editor.left}
                onChange={(event) => setEditor({ ...editor, left: event.target.value })}
              >
                {CAMPAIGN_METRIC_KEYS.map((key) => (
                  <option value={key} key={key}>
                    {CAMPAIGN_COLUMNS[key].name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Phép tính
              <select
                value={editor.operator}
                onChange={(event) => setEditor({ ...editor, operator: event.target.value })}
              >
                {['+', '-', '*', '/'].map((operator) => (
                  <option value={operator} key={operator}>
                    {operator === '*' ? '×' : operator === '/' ? '÷' : operator}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Đối số thứ hai
              <select
                value={editor.rightType}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    rightType: event.target.value,
                    right: event.target.value === 'constant' ? '1' : 'spend',
                  })
                }
              >
                <option value="metric">Chỉ số</option>
                <option value="constant">Hằng số</option>
              </select>
            </label>
            <label className="field">
              {editor.rightType === 'constant' ? 'Giá trị hằng số' : 'Chỉ số thứ hai'}
              {editor.rightType === 'constant' ? (
                <input
                  type="number"
                  step="any"
                  required
                  value={editor.right}
                  onChange={(event) => setEditor({ ...editor, right: event.target.value })}
                />
              ) : (
                <select
                  value={editor.right}
                  onChange={(event) => setEditor({ ...editor, right: event.target.value })}
                >
                  {CAMPAIGN_METRIC_KEYS.map((key) => (
                    <option value={key} key={key}>
                      {CAMPAIGN_COLUMNS[key].name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
          <p className="formula-preview">
            {CAMPAIGN_COLUMNS[editor.left]?.name} {editor.operator}{' '}
            {editor.rightType === 'constant' ? editor.right : CAMPAIGN_COLUMNS[editor.right]?.name}
          </p>
          <p className="field-hint">
            Chia cho 0 hiển thị “—”. Định dạng % chỉ thêm ký hiệu %, không tự nhân 100. Mỗi công
            thức tính từ tổng số liệu của chiến dịch trong khoảng ngày đang chọn.
          </p>
          <div className="column-formula-actions">
            <Button onClick={() => setEditor(null)}>Hủy công thức</Button>
            <Button type="submit" variant="primary">
              <Plus size={15} /> Thêm / cập nhật vào cột
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <span>
          {demo
            ? 'Lưu riêng trên trình duyệt cho dữ liệu mẫu.'
            : 'Lưu theo workspace, dùng lại trên các thiết bị.'}
        </span>
        <Button disabled={saving} onClick={onClose}>
          Hủy
        </Button>
        <Button
          variant="primary"
          busy={saving}
          disabled={!selected.length || Boolean(editor)}
          onClick={save}
        >
          <Save size={15} /> Lưu hiển thị
        </Button>
      </div>
    </Modal>
  );
}
