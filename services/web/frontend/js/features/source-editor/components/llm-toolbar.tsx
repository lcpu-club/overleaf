import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { marked } from "marked"

export type LLMToolbarHandle = {
  show: (view: EditorView) => void
  hide: () => void
  getSelectedText: () => string
}

const ArrowUpIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 5l-6 6h4v7h4v-7h4l-6-6z" /></svg>
)
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4a2 2 0 00-2 2v12h2V3h12V1zm3 4H8a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h11v14z" /></svg>
)
const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75l11.02-11.02-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" /></svg>
)
const TrackIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9zm1 13h-2v-6h2v6zm0-8h-2V7h2v1z" /></svg>
)
const Spinner = () => (
  <div style={{ width: 16, height: 16, borderRadius: 8, border: '2px solid rgba(255,255,255,0.12)', borderTopColor: 'rgba(255,255,255,0.7)', animation: 'llm-spin 0.9s linear infinite' }} />
)

/* ---------- helpers ---------- */

function diffWords(orig: string, mod: string) {
  const ws = /\s+/g
  const a = orig.trim() ? orig.split(ws) : []
  const b = mod.trim() ? mod.split(ws) : []
  const n = a.length, m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; --i) for (let j = m - 1; j >= 0; --j) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops: { type: 'equal' | 'del' | 'add'; text: string }[] = []
  let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push({ type: 'equal', text: a[i] }); i++; j++ }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push({ type: 'add', text: b[j] }); j++ }
    else if (i < n) { ops.push({ type: 'del', text: a[i] }); i++ }
  }
  return ops
}

// Escape HTML to avoid injecting into attributes (used for fallback)
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}

// base64 encode/decode unicode-safe
function base64EncodeUnicode(str: string) {
  try {
    return btoa(unescape(encodeURIComponent(str)))
  } catch (e) {
    // fallback: try simple btoa
    return btoa(str)
  }
}
function base64DecodeUnicode(b64: string) {
  try {
    return decodeURIComponent(escape(atob(b64)))
  } catch (e) {
    return atob(b64)
  }
}

/* ---------- types ---------- */

type ParaphraseKind = 'paraphrase' | 'style' | 'splitjoin' | 'summarize' | 'explain' | 'title' | 'abstract' | 'chat'
const kindTitleMap: Record<ParaphraseKind, string> = {
  paraphrase: 'Paraphrase',
  style: 'Change style',
  splitjoin: 'Split / Join',
  summarize: 'Summarize',
  explain: 'Explain',
  title: 'Title Generator',
  abstract: 'Abstract Generator',
  chat: 'AI Response'
}

/* ---------- component ---------- */

const LLMToolbar = forwardRef<LLMToolbarHandle, {}>((_, ref) => {
  // UI placement & mode
  const [anchorShown, setAnchorShown] = useState(false) // shows circular AI button
  const [panelRect, setPanelRect] = useState({ top: 0, left: 0, width: 520 })
  const [anchorPos, setAnchorPos] = useState({ top: 0, left: 0 })
  const [panelMode, setPanelMode] = useState<'hidden' | 'menu' | 'chat' | 'paraphrase'>('hidden')
  const [submenu, setSubmenu] = useState<null | 'style' | 'splitjoin'>(null)

  // data
  const [query, setQuery] = useState('')
  const [selectionText, setSelectionText] = useState('')
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null)
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [kind, setKind] = useState<ParaphraseKind>('paraphrase')

  // editor height state (used to compute 70%)
  const [editorHeight, setEditorHeight] = useState<number>(600) // fallback

  // refs
  const viewRef = useRef<EditorView | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const editRef = useRef<HTMLTextAreaElement | null>(null)

  // Collect context helpers (kept from original)
  const collectContext = () => {
    const filelist: string[] = []
    const outline: string[] = []
    try { document.querySelectorAll('.file-tree .entity-name').forEach(el => { const t = el.textContent?.trim(); if (t) filelist.push(t) }) } catch (e) { /* ignore */ }
    try { document.querySelectorAll('.outline-pane .outline-item').forEach(el => { const t = el.textContent?.trim(); if (t) outline.push(t) }) } catch (e) { /* ignore */ }
    return { filelist, outline }
  }

  const postToAPI = async (mode: number, ask: string) => {
    const { filelist, outline } = collectContext()
    const body = { ask, selection: selectionText, filelist, outline, mode }
    try {
      const resp = await fetch('/api/v1/llm/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      if (!resp) throw new Error('no response')
      const json = await resp.json()
      if (json?.success) return typeof json.data === 'string' ? json.data : JSON.stringify(json.data)
      throw new Error(json?.message || 'api error')
    } catch (err: any) {
      console.error('LLM API error', err)
      return `Error: ${err?.message || 'Request failed'}`
    }
  }

  // startFetch will: set kind, open appropriate panel (chat/paraphrase),
  // close the menu list (if open) but keep the input + panel visible while waiting.
  const startFetch = async (mode: number, k: ParaphraseKind, ask?: string) => {
    setKind(k)
    setPanelMode(k === 'chat' ? 'chat' : 'paraphrase') // show chat/paraphrase panel (this closes the menu)
    setLoading(true)
    setEditMode(false)
    setShowDiff(false)
    setResult('')

    const resp = await postToAPI(mode, (ask ?? query).trim())
    setResult(resp)
    setLoading(false)
  }

  // update editorHeight on window resize (use viewRef if available)
  useEffect(() => {
    const update = () => {
      const h = viewRef.current?.dom?.getBoundingClientRect()?.height ?? window.innerHeight
      if (typeof h === 'number' && h > 0) setEditorHeight(h)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // ---------- marked renderer customization ----------
  const renderer = useMemo(() => {
    const r = new marked.Renderer()
    // override code rendering to wrap LaTeX blocks with copy button
    r.code = (code: string, infostring: string | undefined, escaped: boolean) => {
      const lang = (infostring || '').trim().toLowerCase()
      const isLatex = lang === 'latex' || lang === 'tex' || code.trim().startsWith('\\')
      const safeCodeHtml = escapeHtml(code)
      if (isLatex) {
        const b64 = base64EncodeUnicode(code)
        // wrapper with a copy button (data-code contains base64-encoded latex)
        return `
          <div class="llm-latex-block" style="position:relative;">
            <button class="llm-copy-latex" data-code="${b64}" title="Copy LaTeX" style="position:absolute;right:8px;top:8px;border-radius:6px;padding:4px 6px;border:none;background:rgba(255,255,255,0.03);color:#e6eef8;cursor:pointer">📋</button>
            <pre style="margin:0;"><code class="language-${escapeHtml(lang)}">${safeCodeHtml}</code></pre>
          </div>
        `
      }
      // default: normal code block
      return `<pre><code class="language-${escapeHtml(lang)}">${safeCodeHtml}</code></pre>`
    }
    return r
  }, [])

  // compute rendered HTML from result using our renderer
  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(result || "No result yet.", { renderer })
    } catch (e) {
      return escapeHtml(result || "No result yet.")
    }
  }, [result, renderer])

  // ---------- copy button delegation ----------
  useEffect(() => {
    const root = wrapRef.current
    if (!root) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const btn = target.closest ? (target.closest('.llm-copy-latex') as HTMLElement | null) : null
      if (!btn) return
      const b64 = btn.getAttribute('data-code')
      if (!b64) return
      const code = base64DecodeUnicode(b64)
        ; (async () => {
          try {
            await navigator.clipboard.writeText(code)
            const prev = btn.innerText
            btn.innerText = '✓'
            setTimeout(() => { btn.innerText = prev }, 900)
          } catch (err) {
            console.warn('copy failed', err)
            const prev = btn.innerText
            btn.innerText = '✕'
            setTimeout(() => { btn.innerText = prev }, 900)
          }
        })()
    }
    root.addEventListener('click', handler)
    return () => root.removeEventListener('click', handler)
  }, [])

  // imperative API
  useImperativeHandle(ref, () => ({
    show: (view: EditorView) => {
      viewRef.current = view
      const sel = view.state.selection.main
      if (sel.empty) return // IMPORTANT: do nothing if empty selection (do not auto-open panel)

      // compute positions (use wrap ref if available)
      const wrapRect = wrapRef.current?.getBoundingClientRect()
      const editorRect = view.dom.getBoundingClientRect()
      const coordsFrom = view.coordsAtPos(sel.from)
      const coordsTo = view.coordsAtPos(sel.to)
      const toLocal = (c: { left: number; top: number }) => ({ x: wrapRect ? c.left - wrapRect.left : c.left, y: wrapRect ? c.top - wrapRect.top : c.top })

      let aTop = 0, aLeft = 0
      if (coordsFrom && coordsTo) {
        const top = Math.min(coordsFrom.top, coordsTo.top)
        const bottom = Math.max(coordsFrom.bottom, coordsTo.bottom)
        const right = Math.max(coordsFrom.right, coordsTo.right)
        const left = Math.min(coordsFrom.left, coordsTo.left)
        const midY = top + (bottom - top) / 2
        aTop = toLocal({ left: 0, top: midY }).y - 14
        aLeft = toLocal({ left: right, top: 0 }).x - 14
      } else {
        aTop = (editorRect.top + editorRect.height / 2) - (wrapRect?.top ?? 0) - 14
        aLeft = (editorRect.right - (wrapRect?.left ?? 0)) - 44
      }

      const containerW = wrapRect?.width ?? window.innerWidth
      const containerH = wrapRect?.height ?? window.innerHeight
      const clampedTop = Math.round(Math.max(8, Math.min(containerH - 44, aTop)))
      const clampedLeft = Math.round(Math.max(8, Math.min(containerW - 44, aLeft)))

      const width = Math.max(320, Math.min(560, containerW - 24))
      const panelTop = Math.round(Math.max(12, Math.min((wrapRect ? (editorRect.top - wrapRect.top) : 0) + 52, containerH - 260 - 12)))
      const panelLeft = Math.round(Math.max(12, Math.min(containerW - width - 12, (wrapRect ? (editorRect.left - wrapRect.left) : 0) + editorRect.width / 2 - width / 2)))

      setPanelRect({ top: panelTop, left: panelLeft, width })
      setAnchorPos({ top: clampedTop, left: clampedLeft })
      setSelectionText(view.state.sliceDoc(sel.from, sel.to))
      setSelectionRange({ from: sel.from, to: sel.to })

      // update editorHeight immediately from editorRect (so panels use correct maxHeight)
      if (editorRect && typeof editorRect.height === 'number') setEditorHeight(editorRect.height)

      // IMPORTANT: restore original behavior — only show the circular anchor button,
      // DO NOT automatically open the panel. User must click the anchor.
      setAnchorShown(true)
      setPanelMode('hidden')
    },
    hide: () => { setAnchorShown(false); setPanelMode('hidden'); setSubmenu(null) },
    getSelectedText: () => selectionText,
  }))

  // autofocus input when panel opens
  useEffect(() => {
    if (panelMode !== 'hidden') {
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true } as any))
    }
  }, [panelMode])

  // input behavior: Enter => close menu list and open chat panel waiting for backend.
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Close menu (if menu), but keep the input / panel visible and start chat fetch.
      // That meets the requirement: don't close the whole panel.
      startFetch(0, 'chat')
    } else if (e.key === 'Escape') {
      setPanelMode('hidden')
      setAnchorShown(false)
    }
  }

  const replaceSelectionWith = (text: string) => {
    const view = viewRef.current
    const r = selectionRange
    if (!view || !r) return
    view.dispatch({ changes: { from: r.from, to: r.to, insert: text } })
    // close UI
    setPanelMode('hidden'); setAnchorShown(false); setResult(''); setQuery('')
  }

  const insertCodeAfterSelection = (text: string) => {
    const view = viewRef.current
    const r = selectionRange
    if (!view || !r) return

    // extract LaTeX content from markdown returned by backend
    const extractLatexFromMarkdown = (md: string) => {
      if (!md) return ''
      let m: RegExpExecArray | null
      let collected = ''

      // 1) fenced code blocks with explicit latex/tex language
      const fencedLangRegex = /```\s*(?:latex|tex)\n([\s\S]*?)```/ig
      while ((m = fencedLangRegex.exec(md)) !== null) collected += m[1].trim() + '\n'
      if (collected) return collected.trim()

      // 2) any fenced code blocks that look like LaTeX (contain typical LaTeX markers)
      const fencedAny = /```(?:\w+)?\n([\s\S]*?)```/g
      while ((m = fencedAny.exec(md)) !== null) {
        const code = m[1]
        // heuristics: common LaTeX patterns
        if (/\\begin\{|\\[a-zA-Z]+|\\frac\{|\\end\{/.test(code)) collected += code.trim() + '\n'
      }
      if (collected) return collected.trim()

      // 3) $$ ... $$ blocks
      const dollarsRegex = /\$\$([\s\S]*?)\$\$/g
      while ((m = dollarsRegex.exec(md)) !== null) collected += m[1].trim() + '\n'
      if (collected) return collected.trim()

      // 4) single $...$ (only include if it looks like LaTeX)
      const singleDollar = /\$([^\$\n]{1,1000}?)\$/g
      while ((m = singleDollar.exec(md)) !== null) {
        if (/\\[a-zA-Z]+/.test(m[1])) collected += m[1].trim() + '\n'
      }
      if (collected) return collected.trim()

      // 5) fallback: remove fenced code fences and basic markdown formatting, return remaining text
      const withoutFences = md.replace(/```[\s\S]*?```/g, (s) => s.replace(/```(?:\w+)?\n/, '').replace(/```$/, ''))
      // basic cleanup: headings, bold/italic, links
      const noMd = withoutFences
        .replace(/(^|\n)#+\s+/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      return noMd.trim()
    }

    const code = extractLatexFromMarkdown(text)
    const toInsert = code ? ('\n' + code + '\n') : ('\n' + text + '\n')
    view.dispatch({ changes: { from: r.to, to: r.to, insert: toInsert } })
    setPanelMode('hidden'); setAnchorShown(false); setQuery('')
  }


  const copyToClipboard = async (t: string) => { try { await navigator.clipboard.writeText(t) } catch (e) { console.warn('copy failed', e) } }

  const modeMap: Record<number, ParaphraseKind | undefined> = {
    1: 'paraphrase', 2: 'style', 3: 'style', 4: 'style', 5: 'splitjoin', 6: 'splitjoin', 7: 'summarize', 8: 'explain', 9: 'title', 10: 'abstract'
  }

  // helper: kind -> mode number for regenerate calls
  const kindToMode: Record<ParaphraseKind, number> = { paraphrase: 1, style: 2, splitjoin: 5, summarize: 7, explain: 8, title: 9, abstract: 10, chat: 0 }

  // compute content container maxHeight (50% of viewport height), with sensible min clamp
  const contentMaxHeight = Math.max(140, Math.round(window.innerHeight * 0.5))

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
      <style>{`@keyframes llm-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} 
        .llm-anchor{position:absolute;width:28px;height:28px;border-radius:999px;background:linear-gradient(180deg,#0b1220,#0f172a);color:#eef2ff;border:1px solid rgba(255,255,255,0.08);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 6px 22px rgba(2,6,23,0.45);cursor:pointer;pointer-events:auto}
        .llm-panel{position:absolute;pointer-events:auto;user-select:none}
        .llm-input-card{width:100%;background:linear-gradient(180deg,#071021,#071827);border-radius:14px;padding:12px 12px 12px 56px;position:relative;box-shadow:0 14px 40px rgba(3,8,22,0.55);border:1px solid rgba(255,255,255,0.04)}
        .llm-badge{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;color:#e6eef8}
        .llm-input{width:100%;min-height:40px;max-height:160px;padding:8px 84px 8px 10px;border-radius:10px;background:transparent;color:#e6eef8;border:1px solid rgba(255,255,255,0.06);outline:none;resize:none;line-height:20px;font-size:14px;box-sizing:border-box}
        .llm-send{position:absolute;right:44px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,0.02);display:flex;align-items:center;justify-content:center;cursor:pointer}
        .llm-close{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,0.02);display:flex;align-items:center;justify-content:center;cursor:pointer}
        .llm-menu{margin-top:0px;background:linear-gradient(180deg,#071021,#071827);border-radius:12px;padding:10px 8px;color:#dfe7ee;border:1px solid rgba(255,255,255,0.04);box-shadow:0 14px 40px rgba(3,8,22,0.55)}
        .llm-item{height:40px;display:flex;align-items:center;gap:10px;padding:0 10px;border-radius:10px;cursor:pointer}
        .llm-paraphrase-card{pointer-events:auto;width:100%;background:#071223;border-radius:12px;padding:12px;box-shadow:0 14px 40px rgba(3,8,22,0.55);border:1px solid rgba(255,255,255,0.06);color:#e6eef8}
        .llm-paraphrase-text{width:100%;min-height:88px;padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);color:#e6eef8;outline:none;resize:vertical;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
        .llm-paraphrase-footer{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}
        .llm-btn{padding:8px 12px;border-radius:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.06);background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))}
        .llm-btn.llm-primary{background:linear-gradient(180deg, rgba(16,185,129,0.14), rgba(16,185,129,0.08));border:1px solid rgba(16,185,129,0.22)}
        /* allow inner content HTML to inherit sensible typography */
        .llm-result-html { 
          overflow-x: hidden; 
          word-wrap: break-word; 
          word-break: break-word; 
          overflow-wrap: anywhere; 
        }
        .llm-result-html h1, .llm-result-html h2, .llm-result-html h3 { 
          color: #e6eef8; 
          margin: 6px 0; 
          word-wrap: break-word; 
        }
        .llm-result-html p, .llm-result-html li { 
          color: #dfe7ee; 
          margin: 4px 0; 
          word-wrap: break-word; 
        }
        .llm-result-html pre { 
          background: rgba(0,0,0,0.45); 
          padding: 8px; 
          border-radius: 6px; 
          overflow-x: auto; 
          overflow-y: hidden;
          color: #e6eef8;
          white-space: pre-wrap;
          word-wrap: break-word;
          max-width: 100%;
        }
        .llm-result-html code { 
          word-wrap: break-word; 
          white-space: pre-wrap; 
        }
        .llm-result-html table { 
          width: 100%; 
          table-layout: fixed; 
          overflow-x: hidden; 
        }
        .llm-result-html td, .llm-result-html th { 
          word-wrap: break-word; 
          overflow-wrap: anywhere; 
        }
        .llm-copy-latex { font-size: 13px; }
      `}</style>

      {/* circular AI anchor - visible after selection; clicking it opens the menu */}
      {anchorShown && panelMode === 'hidden' && !loading && (
        <button
          className="llm-anchor"
          style={{ top: anchorPos.top, left: anchorPos.left }}
          onClick={() => setPanelMode('menu')}
          title="AI"
        >
          AI
        </button>
      )}

      {/* main menu (opened after clicking anchor) */}
      {anchorShown && panelMode === 'menu' && (
        <div ref={panelRef} className="llm-panel" style={{ top: panelRect.top, left: panelRect.left, width: panelRect.width }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="llm-input-card">
              <div className="llm-badge">AI</div>
              <textarea
                ref={inputRef}
                className="llm-input"
                placeholder="Ask AI for help"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                rows={1}
              />
              <button className="llm-send" onClick={() => startFetch(0, 'chat')} title="Send"><ArrowUpIcon /></button>
              <button className="llm-close" onClick={() => { setPanelMode('hidden'); setAnchorShown(false) }} title="Close">×</button>
            </div>

            <div className="llm-menu" style={{ width: Math.min(220, panelRect.width - 36) }}>
              <div style={{ fontSize: 12, color: '#98a3af', padding: '6px 8px' }}>Context Options</div>

              <div className="llm-item" onClick={() => startFetch(1, 'paraphrase')}><ArrowUpIcon /> <span>Paraphrase</span></div>

              <div style={{ position: 'relative' }} onMouseEnter={() => setSubmenu('style')} onMouseLeave={() => setSubmenu(null)}>
                <div className="llm-item"><EditIcon /> <span>Change style</span></div>
                {submenu === 'style' && (
                  // moved right by 110% to avoid overlapping with main menu
                  <div style={{ position: 'absolute', left: '104%', top: 0, minWidth: 120 }} className="llm-menu">
                    <div className="llm-item" onClick={() => startFetch(2, 'style')}>Scientific</div>
                    <div className="llm-item" onClick={() => startFetch(3, 'style')}>Concise</div>
                    <div className="llm-item" onClick={() => startFetch(4, 'style')}>Punchy</div>
                  </div>
                )}
              </div>

              <div style={{ position: 'relative' }} onMouseEnter={() => setSubmenu('splitjoin')} onMouseLeave={() => setSubmenu(null)}>
                <div className="llm-item"><ArrowUpIcon /> <span>Split/Join</span></div>
                {submenu === 'splitjoin' && (
                  <div style={{ position: 'absolute', left: '104%', top: 0, minWidth: 120 }} className="llm-menu">
                    <div className="llm-item" onClick={() => startFetch(5, 'splitjoin')}>Split</div>
                    <div className="llm-item" onClick={() => startFetch(6, 'splitjoin')}>Join</div>
                  </div>
                )}
              </div>

              <div className="llm-item" onClick={() => startFetch(7, 'summarize')}><CopyIcon /> <span>Summarize</span></div>
              <div className="llm-item" onClick={() => startFetch(8, 'explain')}><TrackIcon /> <span>Explain</span></div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.03)', margin: '8px 0' }} />
              <div style={{ fontSize: 12, color: '#98a3af', padding: '6px 8px' }}>Widgets</div>
              <div className="llm-item" onClick={() => startFetch(9, 'title')}><ArrowUpIcon /> <span>Title Generator</span></div>
              <div className="llm-item" onClick={() => startFetch(10, 'abstract')}><CopyIcon /> <span>Abstract Generator</span></div>
            </div>
          </div>
        </div>
      )}

      {/* chat panel (input retained, result area shown) */}
      {anchorShown && panelMode === 'chat' && (
        <div ref={panelRef} className="llm-panel" style={{ top: panelRect.top, left: panelRect.left, width: panelRect.width }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="llm-input-card">
              <div className="llm-badge">AI</div>
              <textarea
                ref={inputRef}
                className="llm-input"
                placeholder="Ask AI for help"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                rows={1}
              />
              <button className="llm-send" onClick={() => startFetch(0, 'chat')} title="Send"><ArrowUpIcon /></button>
              <button className="llm-close" onClick={() => { setPanelMode('hidden'); setAnchorShown(false); setQuery('') }} title="Close">×</button>
            </div>

            <div className="llm-paraphrase-card">
              <div style={{ fontSize: 13, color: '#9fb0c6' }}>{kindTitleMap['chat']}</div>

              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                  <Spinner />
                  <div style={{ marginLeft: 10, color: '#9aa4b2' }}>Waiting for AI...</div>
                </div>
              ) : (
                <>
                  {/* Result container with maxHeight = 50% viewport height and scroll */}
                  <div style={{ minHeight: 88, maxHeight: contentMaxHeight, overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 }}>
                    <div className="llm-result-html" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                  </div>

                  <div className="llm-paraphrase-footer">
                    <button className="llm-btn llm-primary" onClick={() => { setPanelMode('hidden'); setQuery(''); setResult('') }}>Cancel</button>
                    <button className="llm-btn llm-primary" onClick={() => insertCodeAfterSelection(result)} disabled={!result}>Insert</button>
                    <button className="llm-btn llm-primary" onClick={() => startFetch(0, 'chat')} disabled={loading || !query.trim()}>
                      {loading ? <><Spinner /><span style={{ fontSize: 13, marginLeft: 8 }}>Regenerating</span></> : 'Regenerate'}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* paraphrase panel */}
      {panelMode === 'paraphrase' && (
        <div className="llm-panel" style={{ top: panelRect.top, left: panelRect.left, width: panelRect.width }}>
          <div className="llm-paraphrase-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#9fb0c6' }}>{kindTitleMap[kind]}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="llm-btn" onClick={() => copyToClipboard(result)}><CopyIcon /> <span style={{ fontSize: 12 }}>Copy</span></button>
                <button className="llm-btn" onClick={() => setEditMode(s => !s)}><EditIcon /> <span style={{ fontSize: 12 }}>{editMode ? 'Done' : 'Edit'}</span></button>
                {(kind !== 'title' && kind !== 'abstract') && (<button className="llm-btn" onClick={() => setShowDiff(s => !s)}><TrackIcon /> <span style={{ fontSize: 12 }}>{showDiff ? 'Hide' : 'Track'}</span></button>)}
              </div>
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Spinner />
                <div style={{ marginLeft: 10, color: '#9aa4b2' }}>Waiting for AI...</div>
              </div>
            ) : (
              <>
                {editMode ? (
                  <textarea
                    ref={editRef}
                    className="llm-paraphrase-text"
                    value={result}
                    onChange={e => setResult(e.target.value)}
                    style={{ maxHeight: contentMaxHeight, overflowY: 'auto', overflowX: 'hidden' }}
                  />
                ) : (
                  <div style={{ minHeight: 88 }}>
                    <div style={{ maxHeight: contentMaxHeight, overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 }}>
                      <div className="llm-result-html" style={{ color: '#e6eef8' }} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                    </div>
                  </div>
                )}

                {showDiff && kind !== 'title' && kind !== 'abstract' && (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)' }}>
                    {diffWords(selectionText, result).map((op, i) => op.type === 'equal' ? <span key={i} style={{ marginRight: 4 }}>{op.text}</span> : op.type === 'del' ? <del key={i} style={{ opacity: 0.7, marginRight: 4 }}>{op.text}</del> : <ins key={i} style={{ background: 'rgba(82, 196, 255,0.12)', marginRight: 4 }}>{op.text}</ins>)}
                  </div>
                )}

                <div className="llm-paraphrase-footer">
                  <button className="llm-btn llm-primary" onClick={() => { setPanelMode('hidden'); setAnchorShown(false); setResult(''); setQuery('') }}>Cancel</button>

                  {/* Footer buttons vary by kind:
                      - title / abstract: Insert, Regenerate
                      - summarize / explain: only Regenerate (and Cancel)
                      - paraphrase / style / splitjoin: Replace, Regenerate
                  */}
                  {(kind === 'title' || kind === 'abstract') ? (
                    <>
                      <button className="llm-btn llm-primary" onClick={() => insertCodeAfterSelection(result)} disabled={loading || !result}>Insert</button>
                    </>
                  ) : ((kind === 'summarize' || kind === 'explain') ? null : (
                    <button className="llm-btn llm-primary" onClick={() => replaceSelectionWith(result)} disabled={loading || !result}>Replace</button>
                  ))}

                  <button className="llm-btn llm-primary" onClick={() => startFetch(kindToMode[kind], kind)} disabled={loading}>
                    {loading ? <><Spinner /><span style={{ marginLeft: 8 }}>Regenerating</span></> : 'Regenerate'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

LLMToolbar.displayName = 'LLMToolbar'
export default LLMToolbar
