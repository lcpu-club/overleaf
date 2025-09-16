// llm.service.js
import { LLMMapper } from "../mappers/llm.mapper.js";
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { LlmClient } from '../utils/LlmClient.js';
import { Base, Chat, Paraphrase, Scientific, Concise, Punchy, Split, Join, Summarize, Explain, TitleGenerator, AbstractGenerator, completion, completion2, fimCompletion } from '../config/index.js';
import { formatResult } from '../utils/common.js';
class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max || 5);
    this.current = 0;
    this.queue = [];
  }
  acquire() {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }
  release() {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.current++;
      next();
    }
  }
}

export class LLMService {
  constructor() {
    this.llmMapper = new LLMMapper();
    this.apiKeyMapper = new ApiKeyMapper();

    // key -> { client, lastUsed, semaphore }
    this.clientPool = new Map();

    this.CLIENT_EXPIRE_MS = 10 * 60 * 1000; // 10 minutes
    this.MAX_CONCURRENT_PER_KEY = 8; // 每个 base+apiKey 的并发上限，可调整
    this.AGENT_OPTIONS = {
      timeout: 60_000,
      keepAlive: true,
      maxSockets: 200,
      retries: 1
    };

    // 周期性清理过期 client（会调用 client.close()）
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.clientPool.entries()) {
        if (now - entry.lastUsed > this.CLIENT_EXPIRE_MS) {
          try {
            entry.client.close();
          } catch (e) { console.error('关闭 LlmClient 失败:', e); }
          this.clientPool.delete(key);
        }
      }
    }, this.CLIENT_EXPIRE_MS);
  }

  async chat(userIdentifier, ask, selection, filelist, outline, mode) {
    console.log("llmservice",userIdentifier,ask, selection, filelist, outline, mode);
    let base = Base;
    switch (mode) {
      case 0: base += Chat; break;
      case 1: base += Paraphrase; break;
      case 2: base += Scientific; break;
      case 3: base += Concise; break;
      case 4: base += Punchy; break;
      case 5: base += Split; break;
      case 6: base += Join; break;
      case 7: base += Summarize; break;
      case 8: base += Explain; break;
      case 9: base += TitleGenerator; break;
      case 10: base += AbstractGenerator; break;
    }
    const history = [{ role: "system", content: base }];

    const usingLlm = await this.apiKeyMapper.getUsingLlm(userIdentifier);
    const llmInfo = await this.apiKeyMapper.getLlmInfo(userIdentifier);

    console.log("llmservice usingllm:",usingLlm,llmInfo);
    const usingLlmInfo = llmInfo[usingLlm];
    console.log("llmservice usingLlmInfo:",usingLlmInfo);
    const model = usingLlmInfo.models[usingLlmInfo.usingChatModel];
    console.log("llmservice model:",model);
    if (!model) throw new Error('未设置聊天模型');

    const { baseUrl, apiKey } = usingLlmInfo;
    const entry = await this.getClient(baseUrl, apiKey);

    const userMessage = JSON.stringify({
      USER_QUERY: ask || "",
      SELECTED_TEXT: selection || "",
      FILE_LIST: filelist || [],
      OUTLINE: outline || []
    }, null, 2);
    history.push({ role: "user", content: userMessage });

    // 并发控制：acquire -> 调用 -> release
    await entry.semaphore.acquire();
    try {
      const response = await entry.client.chat(history, model.id);
      const { content } = response.choices[0].message;
      console.log("llmservice:",content);
      return content;
    } catch (error) {
      console.error('LLM调用失败:', error);
      throw new Error(`LLM调用失败: ${error.message}`);
    } finally {
      entry.lastUsed = Date.now();
      entry.semaphore.release();
    }
  }

  async completion(
    userIdentifier,
    cursorOffset,
    leftContext,
    rightContext,
    language,
    maxLength,
    fileList,
    outline
  ) {
    try {
      // const usingLlm = await this.apiKeyMapper.getUsingLlm(userIdentifier);
      // const llmInfo = await this.apiKeyMapper.getLlmInfo(userIdentifier);
      const { usingLlm, llminfo: llmInfo } = await this.apiKeyMapper.getUsingLlmWithInfo(userIdentifier);
      const usingLlmInfo = llmInfo[usingLlm];

      const model = usingLlmInfo.models[usingLlmInfo.usingCompletionModel];
      if (!model) throw new Error('未设置代码补全模型');

      const { baseUrl, apiKey } = usingLlmInfo;
      const params = { leftContext, rightContext, language, maxLength, fileList, outline };
      const prompt = this.buildPrompt(params);

      const history = [
        { role: "user", content: fimCompletion + prompt }
      ];

      const entry = await this.getClient(baseUrl, apiKey);
      await entry.semaphore.acquire();
      try {
        const response = await entry.client.completion(history, model.id);
        console.log("total_tokens", response.usage && response.usage.total_tokens);
        const { content } = response.choices[0].message;
        this.llmMapper.updateUsedTokens(userIdentifier, response.usage.total_tokens);
        return formatResult(content);
      } catch (error) {
        console.error('LLM调用失败:', error);
        throw new Error(`LLM调用失败: ${error.message}`);
      } finally {
        entry.lastUsed = Date.now();
        entry.semaphore.release();
      }
    } catch (error) {
      console.error("流式请求初始化失败:", error);
      throw error;
    }
  }

  /**
   * 返回 client 池中的 entry (client, semaphore, lastUsed)
   */
  async getClient(baseUrl, apiKey) {
    const key = `${baseUrl}_${apiKey}`;
    const now = Date.now();
    if (this.clientPool.has(key)) {
      const entry = this.clientPool.get(key);
      entry.lastUsed = now;
      return entry;
    }

    // 创建新的 LlmClient，注入 agent/keepAlive 配置
    const client = new LlmClient(baseUrl, apiKey, this.AGENT_OPTIONS);
    const semaphore = new Semaphore(this.MAX_CONCURRENT_PER_KEY);
    const entry = { client, semaphore, lastUsed: now };

    this.clientPool.set(key, entry);
    return entry;
  }
  //<PRE>${fileContext} \n${heading}${prefix} <SUF> ${suffix} <MID>
  buildPrompt(params) {
    return `\n\n<FILELIST>${JSON.stringify(params.fileList)}</FILELIST>\n<QUERY>${params.leftContext}{{FILL_HERE}}${params.rightContext}\n</QUERY>\nTASK: Fill the {{FILL_HERE}} hole. Answer only with the CORRECT completion, and NOTHING ELSE. Do it now.<COMPLETION>`;
  }
}
