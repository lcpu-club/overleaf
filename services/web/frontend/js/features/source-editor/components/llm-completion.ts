import { Extension, StateEffect, StateField, EditorState, Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, keymap } from "@codemirror/view";
// =================================================================================
// 1. 类型定义 (Type Definitions)
// =================================================================================

/**
 * 发送给后端的补全请求参数
 */
export interface CompletionOptions {
  cursorOffset: number;
  leftContext: string;
  rightContext: string;
  language: string;
  maxLength: number;
  fileList: string[];
  outline: string[];
}

/**
 * 补全建议的状态对象
 */
type Suggestion = {
  from: number;
  text: string;
  preview: string;
};

/**
 * LlmCompletion 服务返回的结果类型，用于清晰地区分不同情况
 */
type LlmCompletionResult =
  | { kind: "ok"; data: string }
  | { kind: "aborted" }
  | { kind: "error"; reason?: string; body?: any };


// =================================================================================
// 2. UI 工具函数 (UI Utilities)
// =================================================================================

const TOAST_CONTAINER_ID = "llm-toast-container";
let toastStyleInjected = false;
let toastContainer: HTMLElement | null = null;

// 添加 ResizeObserver 错误处理
let resizeObserverErrorHandled = false;

function setupResizeObserverErrorHandler() {
  if (resizeObserverErrorHandled || typeof window === 'undefined') return;
  
  // 捕获并静默处理 ResizeObserver 循环错误
  const originalErrorHandler = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (typeof message === 'string' && 
        message.includes('ResizeObserver loop completed with undelivered notifications')) {
      console.debug('[LLM-Completion] Suppressed ResizeObserver loop error');
      return true; // 阻止错误冒泡
    }
    if (originalErrorHandler) {
      return originalErrorHandler.call(this, message, source, lineno, colno, error);
    }
    return false;
  };
  
  resizeObserverErrorHandled = true;
}

/**
 * 确保 Toast 提示所需的 CSS 样式已被注入到页面中。
 */
function ensureToastStyles() {
  if (toastStyleInjected || typeof document === 'undefined') return;
  try {
    // 检查是否已经存在样式
    if (document.querySelector('[data-llm-toast-style]')) {
      toastStyleInjected = true;
      return;
    }
    
    const style = document.createElement("style");
    style.setAttribute("data-llm-toast-style", "true");
    style.textContent = `
      #${TOAST_CONTAINER_ID} {
        position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
        z-index: 999999; display: flex; flex-direction: column;
        align-items: center; gap: 8px; pointer-events: none;
        contain: layout style paint; /* 优化重排重绘 */
      }
      .llm-toast {
        background: rgba(0,0,0,0.85); color: #fff; font-size: 14px;
        line-height: 1.4; border-radius: 8px; padding: 10px 14px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.25); opacity: 0;
        transform: translateY(6px); transition: opacity 180ms ease, transform 180ms ease;
        pointer-events: auto; text-align: center; max-width: min(92vw, 520px);
        will-change: opacity, transform; /* 优化动画性能 */
      }
      .llm-toast.show { opacity: 1; transform: translateY(0); }
    `;
    document.head.appendChild(style);
    toastStyleInjected = true;
  } catch { /* ignore */ }
}

/**
 * 确保用于展示 Toast 的 DOM 容器存在。
 */
function ensureToastContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  try {
    // 重用已存在的容器引用
    if (toastContainer && toastContainer.parentNode) {
      return toastContainer;
    }
    
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = TOAST_CONTAINER_ID;
      document.body.appendChild(container);
    }
    toastContainer = container;
    return container;
  } catch {
    return null;
  }
}

/**
 * 显示一个短暂的 Toast 提示消息。
 * @param message 要显示的消息
 * @param durationMs 显示时长 (毫秒)
 */
function showToast(message: string, durationMs = 3000) {
  try {
    ensureToastStyles();
    const container = ensureToastContainer();
    if (!container) return;

    const el = document.createElement("div");
    el.className = "llm-toast";
    el.textContent = message;
    
    // 使用 DocumentFragment 减少重排
    const fragment = document.createDocumentFragment();
    fragment.appendChild(el);
    container.appendChild(fragment);

    // 延迟到下一帧显示，避免同步布局计算
    requestAnimationFrame(() => {
      if (el.parentNode) {
        el.classList.add("show");
      }
    });

    setTimeout(() => {
      if (el.parentNode) {
        el.classList.remove("show");
        el.addEventListener('transitionend', () => {
          if (el.parentNode) {
            el.remove();
          }
        }, { once: true });
      }
    }, durationMs);
  } catch { /* ignore */ }
}


// =================================================================================
// 3. 后端服务类 (Backend Service Class)
// =================================================================================

/**
 * 封装了与后端 LLM 补全 API 的交互逻辑。
 */
class LlmCompletion {
  /**
   * 创建一个补全请求。
   * 此方法永不抛出异常，而是返回一个包含 `kind` 字段的对象来指示结果。
   * @param options 请求参数
   * @param signal 用于中止请求的 AbortSignal
   * @returns 一个 Promise，解析为 LlmCompletionResult 对象
   */
  async createCompletion(options: CompletionOptions, signal?: AbortSignal): Promise<LlmCompletionResult> {
    try {
      const res = await fetch(`/api/v1/llm/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(options),
        signal
      });

      let parsed: any;
      try {
        parsed = await res.json();
      } catch (jsonError) {
        return { kind: "error", reason: "invalid-json", body: "Response was not valid JSON." };
      }

      if (!res.ok) {
        return { kind: "error", reason: "http-error", body: parsed };
      }

      // 根据约定的格式 { success: boolean, data: string } 进行处理
      if (parsed && typeof parsed === "object" && typeof parsed.success === "boolean") {
        if (parsed.success && typeof parsed.data === "string") {
          return { kind: "ok", data: parsed.data };
        } else {
          // 后端明确返回 success: false
          console.warn("[LlmCompletion] Backend indicated failure:", parsed);
          return { kind: "error", reason: "backend-failure", body: parsed };
        }
      }

      // 如果响应格式不符合约定
      console.error("[LlmCompletion] Unexpected response format:", parsed);
      return { kind: "error", reason: "unexpected-format", body: parsed };

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.debug("[LlmCompletion] Fetch aborted.");
        return { kind: "aborted" };
      }
      console.error("[LlmCompletion] Network or other error:", err);
      return { kind: "error", reason: "network-or-unknown" };
    }
  }
}

export const llmCompletion = new LlmCompletion();


// =================================================================================
// 4. CodeMirror 状态管理 (State Management)
// =================================================================================

const setSuggestionEffect = StateEffect.define<Suggestion | null>();

const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    // 优先处理 setSuggestionEffect，直接更新或清除 suggestion
    for (const e of tr.effects) {
      if (e.is(setSuggestionEffect)) return e.value;
    }

    if (!value) return value;

    // 如果文档内容改变，检查是否可以更新 suggestion
    if (tr.docChanged) {
      let changeCount = 0;
      let isSimpleInsertion = true;
      let insertedText = "";
      let changeFrom = -1;

      tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        changeCount++;
        if (fromA !== toA || inserted.toString().includes("\n")) {
          isSimpleInsertion = false;
        }
        insertedText += inserted.toString();
        if (changeFrom === -1) changeFrom = fromA;
      });

      // 仅当用户在 suggestion 的起点进行单行、简单的字符输入时，才尝试“吃掉”suggestion 的前缀
      const shouldUpdate =
        isSimpleInsertion &&
        changeCount === 1 &&
        changeFrom === value.from &&
        insertedText.length > 0 &&
        value.text.startsWith(insertedText);

      if (shouldUpdate) {
        const newText = value.text.slice(insertedText.length);
        if (newText.length > 0) {
          const newFrom = value.from + insertedText.length;
          return { from: newFrom, text: newText, preview: createPreview(newText) };
        }
      }
      // 任何其他类型的文档变更都清除 suggestion
      return null;
    }

    // 如果选区改变，并且光标已不在 suggestion 的位置，则清除
    if (tr.selection && (!tr.selection.main.empty || tr.selection.main.from !== value.from)) {
      return null;
    }

    return value;
  },
  provide: f => [
    EditorView.decorations.compute([f], state => {
      const suggestion = state.field(f);
      return suggestion ? renderGhostDecorations(suggestion, state) : Decoration.none;
    })
  ]
});


// =================================================================================
// 5. CodeMirror 界面插件 (UI Widgets & Decorations)
// =================================================================================

class GhostTextWidget extends WidgetType {
  private static widgetCache = new Map<string, GhostTextWidget>();
  private static readonly MAX_PREVIEW_LINES = 3; // 最多显示3行预览
  
  constructor(readonly text: string) { 
    super(); 
  }
  
  eq(other: GhostTextWidget) { 
    return this.text === other.text; 
  }
  
  toDOM() {
    // 简化的多行文本渲染 - 直接使用 textContent 让浏览器处理换行
    const span = document.createElement("span");
    span.className = "cm-ghostText";
    
    // 限制预览行数
    let text = this.text;
    const lines = text.split('\n');
    if (lines.length > GhostTextWidget.MAX_PREVIEW_LINES) {
      text = lines.slice(0, GhostTextWidget.MAX_PREVIEW_LINES).join('\n') + '\n...';
    }
    
    span.textContent = text;
    return span;
  }
  
  // 静态工厂方法，提供缓存机制
  static create(text: string): GhostTextWidget {
    if (this.widgetCache.has(text)) {
      return this.widgetCache.get(text)!;
    }
    const widget = new GhostTextWidget(text);
    // 限制缓存大小
    if (this.widgetCache.size > 100) {
      const keys = Array.from(this.widgetCache.keys());
      const firstKey = keys[0];
      if (firstKey) {
        this.widgetCache.delete(firstKey);
      }
    }
    this.widgetCache.set(text, widget);
    return widget;
  }
}

/**
 * 渲染幽灵文本（ghost text）的装饰器。
 * @param s 补全建议
 * @param state 编辑器状态
 */
function renderGhostDecorations(s: Suggestion, state: EditorState): DecorationSet {
  return Decoration.set([
    Decoration.widget({
      widget: GhostTextWidget.create(s.text), // 直接使用完整文本，不截取第一行
      side: 1
    }).range(s.from)
  ]);
}


// =================================================================================
// 6. 核心插件逻辑 (Core Plugin Logic)
// =================================================================================

class InlineCompletionPlugin {
  private view: EditorView;
  // 更新配置：改为基于行数的上下文收集
  private config: { language: string; debounceMs: number; maxLeftLines: number; maxRightLines: number; maxLength: number; };

  private debounceTimer: number | null = null;
  private isActive = false;
  private currentSuggestionPos = 0;
  private requestAbortController: AbortController | null = null;

  // 用于防止请求竞争和上下文验证
  private requestSeq = 0;
  private latestRequestId = 0;
  private pendingRequestSeed: string | null = null;
  private readonly seedLen = 50;

  // 输入法状态处理
  private isComposing = false;
  private readonly compositionStartHandler: () => void;
  private readonly compositionEndHandler: () => void;

  constructor(view: EditorView) {
    this.view = view;
    this.config = {
      language: "latex",
      debounceMs: 1000,
      maxLeftLines: 10,
      maxRightLines: Math.floor(10 * 15 / 85), // 约7行
      maxLength: 60,
    };

    this.compositionStartHandler = () => { this.isComposing = true; };
    this.compositionEndHandler = () => {
      this.isComposing = false;
      // 使用 requestIdleCallback 避免与其他 DOM 操作冲突
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => {
          if (!this.isComposing) {
            this.debounceTrigger();
          }
        }, { timeout: 500 });
      } else {
        // 降级到 setTimeout，但增加延迟
        setTimeout(() => {
          if (!this.isComposing) {
            this.debounceTrigger();
          }
        }, 200);
      }
    };
    this.setupCompositionListeners();

    console.debug("[InlineCompletionPlugin] Initialized.");
  }

  update(update: ViewUpdate) {
    // 如果正在使用输入法，或选区不为空，则取消当前的补全并返回
    if (this.isComposing || !update.state.selection.main.empty) {
      this.cancel("composing or selection not empty");
      return;
    }

    // 如果光标移动，取消当前补全
    if (update.selectionSet && this.isActive) {
      const suggestion = this.view.state.field(suggestionField, false);
      if (suggestion && update.state.selection.main.from !== suggestion.from) {
        this.cancel("cursor moved");
      }
    }

    // 仅在用户进行少量、单行的输入时自动触发
    if (shouldTriggerOnInsertion(update, 30)) {
      this.debounceTrigger();
    }
  }

  destroy() {
    this.teardownCompositionListeners();
    this.cancel("plugin destroyed");
    console.debug("[InlineCompletionPlugin] Destroyed.");
  }

  private setupCompositionListeners() {
    this.view.dom.addEventListener('compositionstart', this.compositionStartHandler);
    this.view.dom.addEventListener('compositionend', this.compositionEndHandler);
  }

  private teardownCompositionListeners() {
    this.view.dom.removeEventListener('compositionstart', this.compositionStartHandler);
    this.view.dom.removeEventListener('compositionend', this.compositionEndHandler);
  }

  /**
   * 带防抖地触发补全。
   */
  private debounceTrigger() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.trigger().catch(err => {
        console.error("[InlineCompletionPlugin] Unhandled error in trigger:", err);
      });
    }, this.config.debounceMs);
  }

  /**
   * 立即手动触发补全。
   */
  triggerManual() {
    this.trigger().catch(err => {
      console.error("[InlineCompletionPlugin] Unhandled error in manual trigger:", err);
    });
  }

  /**
   * 核心的触发逻辑：收集上下文、发送请求、处理响应。
   */
  private async trigger() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    // 取消上一个正在进行的请求
    this.cancel("new request");

    // 如果在防抖延迟期间，用户开始使用输入法，则中止
    if (this.isComposing) return;

    const pos = this.view.state.selection.main.head;
    const { leftContext, rightContext } = computeContexts(this.view, pos, this.config.maxLeftLines, this.config.maxRightLines);

    this.isActive = true;
    this.currentSuggestionPos = pos;
    this.requestAbortController = new AbortController();

    // 创建用于验证的 "seed" 和唯一的请求 ID，以处理竞态条件
    // 使用较小的行数来生成验证种子
    const seedLines = 3;
    const { leftContext: seedLeft, rightContext: seedRight } = computeContexts(this.view, pos, seedLines, seedLines);
    const seed = (seedLeft.slice(-this.seedLen) || '') + '|' + (seedRight.slice(0, this.seedLen) || '');
    this.pendingRequestSeed = seed;
    const requestId = ++this.requestSeq;
    this.latestRequestId = requestId;

    const { filelist, outline } = this.collectProjectContext();
    const language = this.getCurrentFileLanguage();

    console.debug(`[InlineCompletionPlugin] Triggering request #${requestId} at pos ${pos}`);

    const result = await llmCompletion.createCompletion({
      cursorOffset: pos,
      leftContext,
      rightContext,
      language,
      maxLength: this.config.maxLength,
      fileList: filelist,
      outline: outline,
    }, this.requestAbortController.signal);

    // 如果请求被中止，或已不是最新的请求，则直接忽略
    if (result.kind === "aborted" || requestId !== this.latestRequestId) {
      console.debug(`[InlineCompletionPlugin] Ignoring stale or aborted response for request #${requestId}`);
      return;
    }

    // 如果请求出错，显示提示
    if (result.kind === "error") {
      showToast("代码补全不可用，请检查网络或后端服务");
      this.cancel("request error");
      return;
    }

    // 在显示结果前，再次验证上下文是否已发生太大变化
    if (!this.verifySeedAtPosition(this.currentSuggestionPos, this.pendingRequestSeed)) {
      console.debug("[InlineCompletionPlugin] Context mismatch, ignoring suggestion.");
      this.cancel('seed-mismatch');
      return;
    }

    const completionText = result.data;
    if (!completionText) {
      this.cancel("no-completion");
      return;
    }

    // 最后检查一次光标位置是否变化
    if (this.view.state.selection.main.head !== this.currentSuggestionPos) {
      this.cancel("cursor-moved-after-request");
      return;
    }

    console.debug(`[InlineCompletionPlugin] Applying suggestion for request #${requestId}`);
    this.view.dispatch({
      effects: setSuggestionEffect.of({
        from: this.currentSuggestionPos,
        text: completionText,
        preview: createPreview(completionText)
      })
    });
  }

  /**
   * 接受当前的补全建议。
   */
  accept(): boolean {
    const suggestion = this.view.state.field(suggestionField, false);
    if (!suggestion) return false;

    // 在插入前再次确认光标位置
    if (this.view.state.selection.main.head !== suggestion.from) {
      this.cancel("accept-failed-cursor-moved");
      return false;
    }

    this.view.dispatch({
      changes: { from: suggestion.from, insert: suggestion.text },
      selection: { anchor: suggestion.from + suggestion.text.length },
      effects: setSuggestionEffect.of(null)
    });
    this.isActive = false;
    return true;
  }

  /**
   * 取消当前的补全流程。这是一个幂等操作。
   * @param reason 取消原因，用于调试
   */
  cancel(reason?: string) {
    if (reason) console.debug(`[InlineCompletionPlugin] Cancelling: ${reason}`);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isActive = false;
    this.pendingRequestSeed = null;

    if (this.requestAbortController) {
      this.requestAbortController.abort();
      this.requestAbortController = null;
    }

    // 如果当前有 suggestion，派发一个 effect 来清除它
    if (this.view.state.field(suggestionField, false)) {
      this.view.dispatch({ effects: setSuggestionEffect.of(null) });
    }
  }

  /**
   * 从 DOM 中收集项目文件列表和文档大纲。
   */
  private collectProjectContext() {
    if (typeof document === 'undefined') return { filelist: [], outline: [] };
    const filelist: string[] = [];
    const outline: string[] = [];
    try {
      document.querySelectorAll('.file-tree .entity-name').forEach(el => {
        const text = el.textContent?.trim().replace('texMenu', 'tex');
        if (text) filelist.push(text);
      });
      document.querySelectorAll('.outline-pane .outline-item').forEach(el => {
        const text = el.textContent?.trim();
        if (text) outline.push(text);
      });
    } catch (e) {
      console.warn("Error collecting project context:", e);
    }
    return { filelist, outline };
  }

  /**
   * 获取当前编辑文件的语言（扩展名）。
   */
  private getCurrentFileLanguage(): string {
    if (typeof document === 'undefined') return this.config.language;
    try {
      const selectedItem = document.querySelector('.file-tree li.selected span');
      const fileName = selectedItem?.textContent?.trim() || '';
      const parts = fileName.split('.');
      if (parts.length > 1) {
        return parts.pop()!;
      }
    } catch (e) {
      console.warn("Error getting current file language:", e);
    }
    return this.config.language;
  }

  /**
   * 验证当前光标位置的上下文是否与请求发送时一致。
   */
  private verifySeedAtPosition(pos: number, seed: string | null): boolean {
    if (!seed) return false;
    // 使用较小的行数来生成验证种子，避免过大的上下文变化检测
    const seedLines = 3; // 左右各3行用于验证
    const { leftContext, rightContext } = computeContexts(this.view, pos, seedLines, seedLines);
    const currentSeed = (leftContext.slice(-this.seedLen) || '') + '|' + (rightContext.slice(0, this.seedLen) || '');
    return currentSeed === seed;
  }
}

// =================================================================================
// 7. 辅助函数与插件导出 (Helpers & Extension Export)
// =================================================================================

/**
 * 提取字符串的第一行。
 */
function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

/**
 * 生成多行文本的预览，最多显示指定行数
 * @param s 原始文本
 * @param maxLines 最大行数，默认3行
 */
function createPreview(s: string, maxLines: number = 3): string {
  const lines = s.split('\n');
  if (lines.length <= maxLines) {
    return s;
  }
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

/**
 * 计算光标左右的上下文，基于行数而非字符数。
 * @param view 编辑器视图
 * @param pos 光标位置
 * @param maxLeftLines 左侧最大行数
 * @param maxRightLines 右侧最大行数
 */
function computeContexts(view: EditorView, pos: number, maxLeftLines: number, maxRightLines: number) {
  const doc = view.state.doc;
  const currentLine = doc.lineAt(pos);
  
  // 计算左侧上下文：从当前行向上收集指定行数
  let leftStartLine = Math.max(1, currentLine.number - maxLeftLines);
  let leftStartPos = doc.line(leftStartLine).from;
  let leftEndPos = pos;
  
  // 如果光标在行中间，需要包含当前行光标之前的部分
  const leftContext = doc.sliceString(leftStartPos, leftEndPos);
  
  // 计算右侧上下文：从当前行向下收集指定行数
  let rightStartPos = pos;
  let rightEndLine = Math.min(doc.lines, currentLine.number + maxRightLines);
  let rightEndPos = doc.line(rightEndLine).to;
  
  // 如果光标在行中间，需要包含当前行光标之后的部分
  const rightContext = doc.sliceString(rightStartPos, rightEndPos);
  
  return { leftContext, rightContext };
}

/**
 * 判断一个文档更新是否是可能触发补全的简单插入操作。
 * @param update 编辑器视图更新对象
 * @param maxInsertThreshold 触发自动补全的最大插入字符数
 */
function shouldTriggerOnInsertion(update: ViewUpdate, maxInsertThreshold: number): boolean {
  if (!update.docChanged) return false;

  let insertedTextLength = 0;
  let isSimpleInsertion = true;

  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const ins = inserted.toString();
    if (fromA !== toA || ins.includes("\n")) {
      isSimpleInsertion = false;
    }
    insertedTextLength += ins.length;
  });

  return isSimpleInsertion && insertedTextLength > 0 && insertedTextLength <= maxInsertThreshold;
}



export const INLINE_COMPLETION_PLUGIN = ViewPlugin.define(
  (view: EditorView) => new InlineCompletionPlugin(view),
  {
    destroy: (plugin) => plugin.destroy(),
  }
);

/**
 * CodeMirror 6 的内联代码补全扩展。
 */
export function inlineCompletionExtension(): Extension {
  // 在扩展初始化时设置错误处理
  setupResizeObserverErrorHandler();
  
  return [
    suggestionField,
    INLINE_COMPLETION_PLUGIN,
    Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter", // 在 macOS 上是 Cmd-Enter, Windows/Linux 上是 Ctrl-Enter
          run: (view) => {
            const plugin = view.plugin(INLINE_COMPLETION_PLUGIN);
            return plugin ? plugin.accept() : false;
          }
        },
        {
          key: "Escape",
          run: (view) => {
            const plugin = view.plugin(INLINE_COMPLETION_PLUGIN);
            if (plugin) {
              plugin.cancel("escape key");
              return true;
            }
            return false;
          }
        },
        {
          key: "Mod-\\", // 在 macOS 上是 Cmd-\, Windows/Linux 上是 Ctrl-\
          run: (view) => {
            const plugin = view.plugin(INLINE_COMPLETION_PLUGIN);
            if (plugin) {
              plugin.triggerManual();
              return true;
            }
            return false;
          }
        }
      ])
    ),
    EditorView.baseTheme({
      ".cm-ghostText": {
        opacity: 0.45,
        color: "var(--cm-ghost-foreground, #888)",
        pointerEvents: "none",
        fontFamily: "inherit", // 继承编辑器字体
        fontSize: "inherit",   // 继承编辑器字号
        lineHeight: "inherit", // 继承编辑器行高
        fontWeight: "inherit", // 继承编辑器字重
        whiteSpace: "pre-wrap", // 保持换行和空白符，同时支持自动换行
        wordWrap: "break-word", // 长单词强制换行
        wordBreak: "break-word", // 在单词边界处换行，必要时在单词内换行
        maxWidth: "100%",      // 限制最大宽度
        verticalAlign: "baseline", // 基线对齐
      },
      ".cm-editor": {
        // 确保编辑器容器有合适的包含上下文
        contain: "layout style paint",
      }
    })
  ];
}
