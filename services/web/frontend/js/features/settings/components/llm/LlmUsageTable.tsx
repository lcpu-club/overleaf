import React, { useState, useEffect, useCallback, useRef } from 'react';
import LlmUsageRow from './LlmUsageRow';

// 定义数据类型
type ModelInfo = {
  id: string;
  object: string;
  owned_by: string;
  _id: string;
};

type UsageInfo = {
  name: string;
  provider: string;
  chatModel: string;
  codeModel: string;
  usedTokens: number;
  models: ModelInfo[];
};

// 错误提示组件
const ErrorAlert: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    // 2秒后自动关闭
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        backgroundColor: '#ef4444',
        color: 'white',
        borderRadius: '4px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        zIndex: 10000,
        animation: 'fadeIn 0.3s, fadeOut 0.3s 1.7s',
      }}
    >
      {message}
    </div>
  );
};

export default function LlmUsageTable() {
  const [providers, setProviders] = useState<{ provider: string; chatModels: string[]; codeModels: string[] }[]>([]);
  const [usageList, setUsageList] = useState<UsageInfo[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '' });
  const [usingIdx, setUsingIdx] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const isLoading = useRef(false);
  const lastFetchTime = useRef(0);
  const MIN_FETCH_INTERVAL = 3000; // 最小请求间隔3秒

  // 显示错误信息
  const showError = useCallback((message: string) => {
    setError(message);
  }, []);

  // 关闭错误信息
  const closeError = useCallback(() => {
    setError(null);
  }, []);

  // 获取模型列表和当前应用服务商 - 使用useCallback固定函数引用
  const fetchUsageData = useCallback(async () => {
    // 防抖处理：防止短时间内多次请求
    const now = Date.now();
    if (isLoading.current || now - lastFetchTime.current < MIN_FETCH_INTERVAL) {
      return;
    }

    try {
      isLoading.current = true;
      lastFetchTime.current = now;

      const [keysRes, usingRes] = await Promise.all([
        fetch('/api/v1/llm/keys', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/v1/llm/usingLlm', { credentials: 'include', cache: 'no-store' }),
      ]);

      // 检查响应状态
      if (!keysRes.ok) {
        showError(`获取服务商列表失败: HTTP ${keysRes.status}`);
        return;
      }
      
      if (!usingRes.ok) {
        showError(`获取当前应用服务商失败: HTTP ${usingRes.status}`);
        return;
      }

      let keysJson: any;
      try {
        keysJson = await keysRes.json();
      } catch (e) {
        console.error('keys response is not JSON', e);
        showError('获取服务商列表失败: 无效的响应格式');
        return;
      }

      if (keysJson && keysJson.success && Array.isArray(keysJson.data)) {
        const newProviders = keysJson.data.map((item: any) => {
          const models = Array.isArray(item.models) ? item.models : [];
          return {
            provider: item.name,
            chatModels: models.map((m: any) => m?.id || ''),
            codeModels: models.map((m: any) => m?.id || ''),
          };
        });
        setProviders(newProviders);

        const newUsageList = keysJson.data.map((item: any) => {
          const models = Array.isArray(item.models) ? item.models : [];
          const chatModel = typeof item.usingChatModel === 'number' ? (models[item.usingChatModel]?.id || '') : '';
          const codeModel = typeof item.usingCompletionModel === 'number' ? (models[item.usingCompletionModel]?.id || '') : '';
          return {
            name: item.name || '',
            provider: item.name || '',
            chatModel,
            codeModel,
            usedTokens: item.usedTokens ?? 0,
            models,
          } as UsageInfo;
        });
        setUsageList(newUsageList);
      } else if (keysJson && !keysJson.success) {
        console.warn('fetch keys failed:', keysJson);
        showError(`获取服务商列表失败: ${keysJson.data || keysJson.message || '未知错误'}`);
      }

      let usingJson: any;
      try {
        usingJson = await usingRes.json();
      } catch (e) {
        console.error('usingLlm response is not JSON', e);
        showError('获取当前应用服务商失败: 无效的响应格式');
        return;
      }

      if (usingJson && usingJson.success && typeof usingJson.data === 'number') {
        setUsingIdx(usingJson.data);
      } else if (usingJson && !usingJson.success) {
        console.warn('fetch usingLlm failed:', usingJson);
        showError(`获取当前应用服务商失败: ${usingJson.data || usingJson.message || '未知错误'}`);
        setUsingIdx(-1);
      }
    } catch (err) {
      console.error('fetchUsageData error:', err);
      showError('网络错误，获取服务商列表失败');
    } finally {
      isLoading.current = false;
    }
  }, [showError]); // 仅依赖showError

  // 初始加载一次数据，不添加fetchUsageData作为依赖
  useEffect(() => {
    fetchUsageData();
    // 空依赖数组确保只在组件挂载时执行一次
  }, []);

  // 切换应用服务商
  const handleUsingChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      const idx = Number(e.target.value);
      setUsingIdx(idx);

      const response = await fetch('/api/v1/llm/usingLlm', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usingLlm: idx }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '设置失败');
      }
    } catch (err) {
      console.error('set usingLlm failed', err);
      showError('设置当前服务商失败');
      // 失败时回滚状态
      await fetchUsageData();
    }
  };

  // 处理Chat模型变更
  const handleChatModelChange = async (name: string, newModel: string) => {
    try {
      // 先更新UI
      setUsageList((prev) => prev.map((u) => (u.name === name ? { ...u, chatModel: newModel } : u)));

      const provider = providers.find((p) => p.provider === name);
      if (!provider) {
        throw new Error('未找到对应的服务商');
      }

      const modelIndex = provider.chatModels.indexOf(newModel);
      if (modelIndex === -1) {
        throw new Error('未找到对应的模型');
      }

      const response = await fetch('/api/v1/llm/usingModel', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, chatOrCompletion: 0, newModel: modelIndex }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '设置失败');
      }
    } catch (err) {
      console.error('usingModel PUT failed', err);
      showError('设置 Chat 模型失败');
      // 失败时回滚状态
      await fetchUsageData();
    }
  };

  // 处理代码补全模型变更
  const handleCodeModelChange = async (name: string, newModel: string) => {
    try {
      setUsageList((prev) => prev.map((u) => (u.name === name ? { ...u, codeModel: newModel } : u)));

      const provider = providers.find((p) => p.provider === name);
      if (!provider) {
        throw new Error('未找到对应的服务商');
      }

      const modelIndex = provider.codeModels.indexOf(newModel);
      if (modelIndex === -1) {
        throw new Error('未找到对应的模型');
      }

      const response = await fetch('/api/v1/llm/usingModel', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, chatOrCompletion: 1, newModel: modelIndex }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '设置失败');
      }
    } catch (err) {
      console.error('usingModel PUT failed', err);
      showError('设置代码补全模型失败');
      // 失败时回滚状态
      await fetchUsageData();
    }
  };

  // 处理删除
  const handleDelete = async (name: string) => {
    try {
      const res = await fetch('/api/v1/llm/keys', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.success === false) {
        throw new Error(data.message || data.data || '后端返回失败');
      }

      await fetchUsageData();
    } catch (err) {
      console.error('删除请求出错', err);
      showError('删除失败，请检查网络');
      await fetchUsageData();
    }
  };

  // 添加新的服务商
  const handleAddProvider = async () => {
    try {
      // 表单验证
      if (!form.name.trim()) {
        showError('请输入服务商名称');
        return;
      }
      if (!form.baseUrl.trim()) {
        showError('请输入Base Url');
        return;
      }
      if (!form.apiKey.trim()) {
        showError('请输入API Key');
        return;
      }

      const res = await fetch('/api/v1/llm/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, baseUrl: form.baseUrl, apiKey: form.apiKey }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        throw new Error(data.message || data.data || '添加失败');
      }

      setShowDialog(false);
      setForm({ name: '', baseUrl: '', apiKey: '' });
      await fetchUsageData();
    } catch (error) {
      console.error('Error adding provider:', error);
      showError('添加失败: 请检查输入信息');
    }
  };

  return (
    <div className="llm-usage">
      <style>{`
        .llm-usage {
          --llm-primary: #2563eb;
          --llm-border: #e5e7eb;
          --llm-bg: #ffffff;
          --llm-muted: #6b7280;
        }
        .llm-table-card {
          background: var(--llm-bg);
          border: 1px solid var(--llm-border);
          border-radius: 12px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.05);
          margin-top: 16px;
          overflow: hidden;
        }
        .llm-table-wrapper {
          width: 100%;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
        }
        .llm-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
        }
        .llm-table thead th {
          background: #f9fafb;
          color: #111827;
          font-weight: 600;
          font-size: 13px;
          letter-spacing: .02em;
          padding: 12px 16px;
          border-bottom: 1px solid var(--llm-border);
          white-space: nowrap;
          text-align: left;
        }
        .llm-table tbody td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--llm-border);
          vertical-align: middle;
        }
        .llm-table tbody tr:hover { background: #f8fafc; }
        .llm-table tbody tr:last-child td { border-bottom: none; }
        .llm-table td:first-child, .llm-table th:first-child { padding-left: 20px; }
        .llm-table td:last-child, .llm-table th:last-child { padding-right: 20px; }

        .llm-name {
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 600;
          color: #0f172a;
        }

        .llm-select {
          padding: 6px 10px;
          border: 1px solid var(--llm-border);
          border-radius: 8px;
          background-color: #ffffff;
          color: #111827;
          transition: border-color .2s ease, box-shadow .2s ease;
        }
        .llm-select:hover { border-color: #d1d5db; }
        .llm-select:focus {
          outline: none;
          border-color: var(--llm-primary);
          box-shadow: 0 0 0 3px rgba(37,99,235,.15);
        }
        .llm-table td .llm-select {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .llm-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 9999px;
          background: #f1f5f9;
          color: #0f172a;
          font-weight: 600;
          font-size: 13px;
          white-space: nowrap;
        }

        @media (max-width: 600px) {
          .llm-badge { font-size: 12px; padding: 3px 8px; }
          .llm-table thead th, .llm-table tbody td { padding: 10px 12px; }
        }

        /* 错误提示动画 */
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translate(-50%, 0); }
          to { opacity: 0; transform: translate(-50%, -20px); }
        }
      `}</style>

      {/* 错误提示 */}
      {error && <ErrorAlert message={error} onClose={closeError} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setShowDialog(true)}>
          添加服务商
        </button>
        <div>
          <label style={{ marginRight: 8 }}>正在应用的服务商：</label>
          <select 
            value={usingIdx} 
            onChange={handleUsingChange} 
            className="llm-select"
            disabled={usageList.length === 0}
          >
            <option value={-1}>未选择</option>
            {usageList.map((item, idx) => (
              <option key={item.name} value={idx}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.3)',
            zIndex: 9999,
          }}
          onClick={() => setShowDialog(false)}
        >
          <div
            style={{
              background: '#fff',
              padding: 24,
              borderRadius: 8,
              width: 320,
              margin: '100px auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4>添加服务商</h4>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>名称：</label>
              <input 
                type="text" 
                value={form.name} 
                onChange={(e) => setForm({ ...form, name: e.target.value })} 
                style={{ width: '100%', padding: 6 }} 
                placeholder="请输入服务商名称" 
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Base Url：</label>
              <input 
                type="text" 
                value={form.baseUrl} 
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} 
                style={{ width: '100%', padding: 6 }} 
                placeholder="例如：https://api.openai.com" 
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>API Key：</label>
              <input 
                type="text" 
                value={form.apiKey} 
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })} 
                style={{ width: '100%', padding: 6 }} 
                placeholder="请输入API密钥" 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-success" onClick={handleAddProvider}>
                确认添加
              </button>
              <button className="btn btn-link" style={{ marginLeft: 8 }} onClick={() => setShowDialog(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="llm-table-card">
        <div className="llm-table-wrapper">
          <table className="llm-table table">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>名称</th>
                <th>Chat模型</th>
                <th>代码补全模型</th>
                <th>已用tokens</th>
                <th>删除</th>
              </tr>
            </thead>
            <tbody>
              {usageList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                    暂无服务商数据，请添加
                  </td>
                </tr>
              ) : (
                usageList.map((item) => {
                  const matchedProvider = providers.find((p) => p.provider === item.provider);
                  return (
                    <LlmUsageRow
                      key={item.name}
                      name={item.name}
                      chatModel={item.chatModel}
                      codeModel={item.codeModel}
                      used={item.usedTokens}
                      chatModels={matchedProvider?.chatModels || []}
                      codeModels={matchedProvider?.codeModels || []}
                      onChatModelChange={(newModel) => handleChatModelChange(item.name, newModel)}
                      onCodeModelChange={(newModel) => handleCodeModelChange(item.name, newModel)}
                      onDelete={() => handleDelete(item.name)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
