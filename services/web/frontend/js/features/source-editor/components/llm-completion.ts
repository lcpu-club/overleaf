import { Extension, StateEffect, StateField, EditorState, Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, keymap } from "@codemirror/view";
// =================================================================================
// 1. Type Definitions
// =================================================================================


export interface CompletionOptions {
  cursorOffset: number;
  leftContext: string;
  rightContext: string;
  language: string;
  maxLength: number;
  fileList: string[];
  outline: string[];
}


type Suggestion = {
  from: number;
  text: string;
  preview: string;
};

/**
 * LlmCompletio
 */
type LlmCompletionResult =
  | { kind: "ok"; data: string }
  | { kind: "aborted" }
  | { kind: "error"; reason?: string; body?: any };


// =================================================================================
// 2. UI Utilities
// =================================================================================

const TOAST_CONTAINER_ID = "llm-toast-container";
let toastStyleInjected = false;
let toastContainer: HTMLElement | null = null;

let resizeObserverErrorHandled = false;

function setupResizeObserverErrorHandler() {
  if (resizeObserverErrorHandled || typeof window === 'undefined') return;
  

  const originalErrorHandler = window.onerror;
  window.onerror = function(message, source, lineno, colno, error) {
    if (typeof message === 'string' && 
        message.includes('ResizeObserver loop completed with undelivered notifications')) {
      console.debug('[LLM-Completion] Suppressed ResizeObserver loop error');
      return true;
    }
    if (originalErrorHandler) {
      return originalErrorHandler.call(this, message, source, lineno, colno, error);
    }
    return false;
  };
  
  resizeObserverErrorHandled = true;
}

/**
 * ensureToastStyles
 */
function ensureToastStyles() {
  if (toastStyleInjected || typeof document === 'undefined') return;
  try {

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
        contain: layout style paint;
      .llm-toast {
        background: rgba(0,0,0,0.85); color: #fff; font-size: 14px;
        line-height: 1.4; border-radius: 8px; padding: 10px 14px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.25); opacity: 0;
        transform: translateY(6px); transition: opacity 180ms ease, transform 180ms ease;
        pointer-events: auto; text-align: center; max-width: min(92vw, 520px);
        will-change: opacity, transform;
      }
      .llm-toast.show { opacity: 1; transform: translateY(0); }
    `;
    document.head.appendChild(style);
    toastStyleInjected = true;
  } catch { /* ignore */ }
}

/**
 * ensureToastContainer
 */
function ensureToastContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  try {
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
 * showToast
 * @param message
 * @param durationMs
 */
function showToast(message: string, durationMs = 3000) {
  try {
    ensureToastStyles();
    const container = ensureToastContainer();
    if (!container) return;

    const el = document.createElement("div");
    el.className = "llm-toast";
    el.textContent = message;
    
    const fragment = document.createDocumentFragment();
    fragment.appendChild(el);
    container.appendChild(fragment);

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
// 3. Backend Service Class
// =================================================================================


class LlmCompletion {
  /**
   * @param options 
   * @param signal AbortSignal
   * @returns
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


      if (parsed && typeof parsed === "object" && typeof parsed.success === "boolean") {
        if (parsed.success && typeof parsed.data === "string") {
          return { kind: "ok", data: parsed.data };
        } else {
          console.warn("[LlmCompletion] Backend indicated failure:", parsed);
          return { kind: "error", reason: "backend-failure", body: parsed };
        }
      }

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
// 4.State Management
// =================================================================================

const setSuggestionEffect = StateEffect.define<Suggestion | null>();

const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSuggestionEffect)) return e.value;
    }

    if (!value) return value;
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
      return null;
    }

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
// 5. UI Widgets & Decorations
// =================================================================================

class GhostTextWidget extends WidgetType {
  private static widgetCache = new Map<string, GhostTextWidget>();
  private static readonly MAX_PREVIEW_LINES = 3;
  
  constructor(readonly text: string) { 
    super(); 
  }
  
  eq(other: GhostTextWidget) { 
    return this.text === other.text; 
  }
  
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-ghostText";
    
    let text = this.text;
    const lines = text.split('\n');
    if (lines.length > GhostTextWidget.MAX_PREVIEW_LINES) {
      text = lines.slice(0, GhostTextWidget.MAX_PREVIEW_LINES).join('\n') + '\n...';
    }
    
    span.textContent = text;
    return span;
  }
  
  static create(text: string): GhostTextWidget {
    if (this.widgetCache.has(text)) {
      return this.widgetCache.get(text)!;
    }
    const widget = new GhostTextWidget(text);
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
 * ghost text
 * @param s
 * @param state
 */
function renderGhostDecorations(s: Suggestion, state: EditorState): DecorationSet {
  return Decoration.set([
    Decoration.widget({
      widget: GhostTextWidget.create(s.text),
      side: 1
    }).range(s.from)
  ]);
}


// =================================================================================
// 6. Core Plugin Logic
// =================================================================================

class InlineCompletionPlugin {
  private view: EditorView;

  private config: { language: string; debounceMs: number; maxLeftLines: number; maxRightLines: number; maxLength: number; };

  private debounceTimer: number | null = null;
  private isActive = false;
  private currentSuggestionPos = 0;
  private requestAbortController: AbortController | null = null;

  private requestSeq = 0;
  private latestRequestId = 0;
  private pendingRequestSeed: string | null = null;
  private readonly seedLen = 50;

  private isComposing = false;
  private readonly compositionStartHandler: () => void;
  private readonly compositionEndHandler: () => void;

  constructor(view: EditorView) {
    this.view = view;
    this.config = {
      language: "latex",
      debounceMs: 1000,
      maxLeftLines: 10,
      maxRightLines: Math.floor(10 * 15 / 85),
      maxLength: 60,
    };

    this.compositionStartHandler = () => { this.isComposing = true; };
    this.compositionEndHandler = () => {
      this.isComposing = false;
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => {
          if (!this.isComposing) {
            this.debounceTrigger();
          }
        }, { timeout: 500 });
      } else {
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
    if (this.isComposing || !update.state.selection.main.empty) {
      this.cancel("composing or selection not empty");
      return;
    }

    if (update.selectionSet && this.isActive) {
      const suggestion = this.view.state.field(suggestionField, false);
      if (suggestion && update.state.selection.main.from !== suggestion.from) {
        this.cancel("cursor moved");
      }
    }

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
   * debounceTrigger
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
   * triggerManual
   */
  triggerManual() {
    this.trigger().catch(err => {
      console.error("[InlineCompletionPlugin] Unhandled error in manual trigger:", err);
    });
  }

  /**
   *  trigger
   */
  private async trigger() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    // cancel any ongoing request or suggestion
    this.cancel("new request");

    // if composing, do not trigger
    if (this.isComposing) return;

    const pos = this.view.state.selection.main.head;
    const { leftContext, rightContext } = computeContexts(this.view, pos, this.config.maxLeftLines, this.config.maxRightLines);

    this.isActive = true;
    this.currentSuggestionPos = pos;
    this.requestAbortController = new AbortController();

    // create a seed for context verification
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

    // if the request was aborted or stale, ignore the result
    if (result.kind === "aborted" || requestId !== this.latestRequestId) {
      console.debug(`[InlineCompletionPlugin] Ignoring stale or aborted response for request #${requestId}`);
      return;
    }

    // if there was an error, notify the user and cancel
    if (result.kind === "error") {
      showToast("completion request failed. Please try again.");
      this.cancel("request error");
      return;
    }

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

    // check if the cursor is still at the original position
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
   * accept the current suggestion and insert it into the document.
   * @returns whether a suggestion was accepted
   */
  accept(): boolean {
    const suggestion = this.view.state.field(suggestionField, false);
    if (!suggestion) return false;

    // ensure the cursor is still at the suggestion position
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
   * cancel the current suggestion and any ongoing request.
   * @param reason
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

    // if there is a suggestion, clear it
    if (this.view.state.field(suggestionField, false)) {
      this.view.dispatch({ effects: setSuggestionEffect.of(null) });
    }
  }

  /**
   * getProjectContext
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
   * getCurrentFileLanguage
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
   * verifySeedAtPosition
   */
  private verifySeedAtPosition(pos: number, seed: string | null): boolean {
    if (!seed) return false;
    // use a smaller line count to generate the verification seed
    const seedLines = 3;
    const { leftContext, rightContext } = computeContexts(this.view, pos, seedLines, seedLines);
    const currentSeed = (leftContext.slice(-this.seedLen) || '') + '|' + (rightContext.slice(0, this.seedLen) || '');
    return currentSeed === seed;
  }
}

// =================================================================================
// 7. Helpers & Extension Export
// =================================================================================

/**
 * extract the first line of a multi-line string.
 */
function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

/**
 * createPreview
 * @param s
 * @param maxLines
 */
function createPreview(s: string, maxLines: number = 3): string {
  const lines = s.split('\n');
  if (lines.length <= maxLines) {
    return s;
  }
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

/**
 * calculate left and right context around a given position in the editor.
 * @param view
 * @param pos
 * @param maxLeftLines
 * @param maxRightLines
 */
function computeContexts(view: EditorView, pos: number, maxLeftLines: number, maxRightLines: number) {
  const doc = view.state.doc;
  const currentLine = doc.lineAt(pos);
  

  let leftStartLine = Math.max(1, currentLine.number - maxLeftLines);
  let leftStartPos = doc.line(leftStartLine).from;
  let leftEndPos = pos;
  

  const leftContext = doc.sliceString(leftStartPos, leftEndPos);
  

  let rightStartPos = pos;
  let rightEndLine = Math.min(doc.lines, currentLine.number + maxRightLines);
  let rightEndPos = doc.line(rightEndLine).to;
  

  const rightContext = doc.sliceString(rightStartPos, rightEndPos);
  
  return { leftContext, rightContext };
}

/**
 * @param update 
 * @param maxInsertThreshold
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


export function inlineCompletionExtension(): Extension {

  setupResizeObserverErrorHandler();
  
  return [
    suggestionField,
    INLINE_COMPLETION_PLUGIN,
    Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter", //macOS:Cmd-Enter, Windows/Linux:Ctrl-Enter
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
          key: "Mod-\\", //macOS:Cmd-\, Windows/Linux:Ctrl-\
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
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: "inherit",
        fontWeight: "inherit",
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        wordBreak: "break-word",
        maxWidth: "100%",
        verticalAlign: "baseline",
      },
      ".cm-editor": {
        contain: "layout style paint",
      }
    })
  ];
}
