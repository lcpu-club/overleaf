// LlmUsageRow.tsx
import React from 'react';

type Props = {
  name: string;
  chatModel: string; 
  codeModel: string;
  used: number;
  chatModels: string[];
  codeModels: string[];
  onChatModelChange: (newModel: string) => void;
  onCodeModelChange: (newModel: string) => void;
  onDelete: () => void;
};

export default function LlmUsageRow({
  name,
  chatModel,
  codeModel,
  used,
  chatModels,
  codeModels,
  onChatModelChange,
  onCodeModelChange,
  onDelete,
}: Props) {
  return (
    <tr>
      <td><span className="llm-name">{name}</span></td>
      {/* Chat模型下拉框 */}
      <td>
        <select
          value={chatModel}
          onChange={(e) => onChatModelChange(e.target.value)}
          className="llm-select"
        >
          {chatModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </td>
      {/* 代码补全模型下拉框 */}
      <td>
        <select
          value={codeModel}
          onChange={(e) => onCodeModelChange(e.target.value)}
          className="llm-select"
        >
          {codeModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </td>
      <td><span className="llm-badge">{used}</span></td>
      <td>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          删除
        </button>
      </td>
    </tr>
  );
}