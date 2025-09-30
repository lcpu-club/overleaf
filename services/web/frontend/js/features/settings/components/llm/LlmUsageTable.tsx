import React, { useState, useEffect, useCallback, useRef } from 'react';
import LlmUsageRow from './LlmUsageRow';

// define types
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

// error alert component
const ErrorAlert: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    // 2 seconds auto close
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
  const MIN_FETCH_INTERVAL = 3000; // minimum interval between fetches in ms

  // show error message
  const showError = useCallback((message: string) => {
    setError(message);
  }, []);

  // close error message
  const closeError = useCallback(() => {
    setError(null);
  }, []);

  // fetch model list and current application provider
  const fetchUsageData = useCallback(async () => {
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

      if (!keysRes.ok) {
        showError(`get service provider list failed: HTTP ${keysRes.status}`);
        return;
      }
      
      if (!usingRes.ok) {
        showError(`get current application provider failed: HTTP ${usingRes.status}`);
        return;
      }

      let keysJson: any;
      try {
        keysJson = await keysRes.json();
      } catch (e) {
        console.error('keys response is not JSON', e);
        showError('get service provider list failed: invalid response format');
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
        showError(`get service provider list failed: ${keysJson.data || keysJson.message || 'unknown error'}`);
      }

      let usingJson: any;
      try {
        usingJson = await usingRes.json();
      } catch (e) {
        console.error('usingLlm response is not JSON', e);
        showError('get current application provider failed: invalid response format');
        return;
      }

      if (usingJson && usingJson.success && typeof usingJson.data === 'number') {
        setUsingIdx(usingJson.data);
      } else if (usingJson && !usingJson.success) {
        console.warn('fetch usingLlm failed:', usingJson);
        showError(`get current application provider failed: ${usingJson.data || usingJson.message || 'unknown error'}`);
        setUsingIdx(-1);
      }
    } catch (err) {
      console.error('fetchUsageData error:', err);
      showError('network error, get service provider list failed');
    } finally {
      isLoading.current = false;
    }
  }, [showError]);

  useEffect(() => {
    fetchUsageData();
  }, []);

  // change current application provider
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
        throw new Error(data.message || 'change failed');
      }
    } catch (err) {
      console.error('set usingLlm failed', err);
      showError('change current application provider failed');
      await fetchUsageData();
    }
  };

  // control chat model change
  const handleChatModelChange = async (name: string, newModel: string) => {
    try {
      setUsageList((prev) => prev.map((u) => (u.name === name ? { ...u, chatModel: newModel } : u)));

      const provider = providers.find((p) => p.provider === name);
      if (!provider) {
        throw new Error('failed to find provider');
      }

      const modelIndex = provider.chatModels.indexOf(newModel);
      if (modelIndex === -1) {
        throw new Error('failed to find corresponding model');
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
        throw new Error(data.message || 'change failed');
      }
    } catch (err) {
      console.error('usingModel PUT failed', err);
      showError('change Chat model failed');
      await fetchUsageData();
    }
  };

  // condtrol code model change
  const handleCodeModelChange = async (name: string, newModel: string) => {
    try {
      setUsageList((prev) => prev.map((u) => (u.name === name ? { ...u, codeModel: newModel } : u)));

      const provider = providers.find((p) => p.provider === name);
      if (!provider) {
        throw new Error('failed to find provider');
      }

      const modelIndex = provider.codeModels.indexOf(newModel);
      if (modelIndex === -1) {
        throw new Error('failed to find corresponding model');
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
        throw new Error(data.message || 'change failed');
      }
    } catch (err) {
      console.error('usingModel PUT failed', err);
      showError('change code model failed');
      await fetchUsageData();
    }
  };

  // control delete provider
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
        throw new Error(data.message || data.data || 'failed to delete');
      }

      await fetchUsageData();
    } catch (err) {
      console.error('delete request failed', err);
      showError('delete failed, please check your network');
      await fetchUsageData();
    }
  };

  // control add provider
  const handleAddProvider = async () => {
    try {
      if (!form.name.trim()) {
        showError('please enter a name');
        return;
      }
      if (!form.baseUrl.trim()) {
        showError('please enter a Base Url');
        return;
      }
      if (!form.apiKey.trim()) {
        showError('please enter an API Key');
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
        throw new Error(data.message || data.data || 'failed to add');
      }

      setShowDialog(false);
      setForm({ name: '', baseUrl: '', apiKey: '' });
      await fetchUsageData();
    } catch (error) {
      console.error('Error adding provider:', error);
      showError('add service provider failed, please check your network and input');
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

        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translate(-50%, 0); }
          to { opacity: 0; transform: translate(-50%, -20px); }
        }
      `}</style>

      {/* error message */}
      {error && <ErrorAlert message={error} onClose={closeError} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setShowDialog(true)}>
          Add
        </button>
        <div>
          <label style={{ marginRight: 8 }}>Current Service Provider:</label>
          <select
            value={usingIdx}
            onChange={handleUsingChange} 
            className="llm-select"
            disabled={usageList.length === 0}
          >
            <option value={-1}>Not Selected</option>
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
            <h4>Add Service Provider</h4>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Name:</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={{ width: '100%', padding: 6 }}
                placeholder="service provider name"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>Base Url:</label>
              <input 
                type="text" 
                value={form.baseUrl} 
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} 
                style={{ width: '100%', padding: 6 }} 
                placeholder="example:https://api.openai.com" 
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>API Key:</label>
              <input 
                type="text" 
                value={form.apiKey} 
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })} 
                style={{ width: '100%', padding: 6 }} 
                placeholder="your API Key" 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-success" onClick={handleAddProvider}>
                Confirm
              </button>
              <button className="btn btn-link" style={{ marginLeft: 8 }} onClick={() => setShowDialog(false)}>
                Concel
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
                <th>Name</th>
                <th>Chat Model</th>
                <th>Completion Model</th>
                <th>Used Tokens</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {usageList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                    No service provider data available, please add
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
