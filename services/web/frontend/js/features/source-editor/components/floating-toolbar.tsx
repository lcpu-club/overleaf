import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { EditorView } from '@codemirror/view'
import { marked } from 'marked'

export type FloatingToolbarHandle = {
  show: (view: EditorView) => void;
  hide: () => void;
  getSelectedText: () => string;
}

type ChatRole = 'user' | 'assistant' | 'system'
type ChatMsg = {
  id: string
  role: ChatRole
  content: string // markdown
  time: string
}

function formatTime(d = new Date()) {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}


marked.setOptions({
  breaks: true,
  gfm: true
})

const FloatingToolbar = forwardRef<FloatingToolbarHandle, {}>((_, ref) => {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [annotation, setAnnotation] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    show: (view: EditorView) => {
      const selection = view.state.selection.main
      if (!selection.empty) {
        const text = view.state.sliceDoc(selection.from, selection.to)
        const startCoords = view.coordsAtPos(selection.from)
        const endCoords = view.coordsAtPos(selection.to)

        if (startCoords && endCoords) {
          setSelectedText(text)
          const editorRect = view.dom.getBoundingClientRect()
          const topPosition = endCoords.bottom - editorRect.top + 5

          setPosition({
            top: topPosition,
            left: 0
          })
          setVisible(true)
        }
      }
    },
    hide: () => {
      
    },
    getSelectedText: () => selectedText
  }))


  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = 200;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [annotation]);
  

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus()
    }
  }, [visible])


  useEffect(() => {
    const el = chatScrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, visible])

  const appendMessage = (msg: Omit<ChatMsg, 'id' | 'time'>) => {
    setMessages(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: formatTime(),
        ...msg
      }
    ])
  }

  const handleSend = async () => {
    const text = annotation.trim()
    if (!text) return

    appendMessage({ role: 'user', content: text })
    setAnnotation('')

    try {
      // Get file tree content
      const fileNames: string[] = []
      try {
        const fileTreeElement = document.querySelector('.file-tree')
        if (fileTreeElement) {
          const elements = fileTreeElement.querySelectorAll('.entity-name')
          for (const el of elements) {
            const name = el.textContent?.trim() || ''
            if (name) fileNames.push(name)
          }
        }
      } catch (e) {
        console.error('get fileList error:', e)
      }

      // Get outline content
      const outlineItems: string[] = []
      try {
        const outlineElement = document.querySelector('.outline-pane')
        if (outlineElement) {
          const items = outlineElement.querySelectorAll('.outline-item')
          for (const item of items) {
            const t = item.textContent?.trim() || ''
            if (t) outlineItems.push(t)
          }
        }
      } catch (e) {
        console.error('get outline error:', e)
      }

      // Prepare request body
      const requestBody = {
        ask: text,
        selection: selectedText,
        filelist: fileNames,
        outline: outlineItems,
        chatOrCompletion: 0
      }
      
      let response: Response | undefined;
      try {
        response = await fetch('http://localhost:9241/api/v1/llm/llm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(requestBody)
        });
      } catch (error) {
        console.error(error);
      }

      if (response) {
        const result = await response.json();
        if (result?.success) {
          const dataMd = typeof result.data === 'string'
            ? result.data
            : JSON.stringify(result.data)
          appendMessage({ role: 'assistant', content: dataMd })
        } else {
          console.error('API quest fail:', result)
          appendMessage({ role: 'assistant', content: 'sorry, service is unavailable' })
        }
      } else {
        console.error('API request failed: No response received')
        appendMessage({ role: 'assistant', content: 'sorry, no response from server' })
      }
    } catch (error) {
      console.error('request failed:', error)
      appendMessage({ role: 'assistant', content: 'sorry, request failed, please check your network or try again later.' })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'Escape') {
      setVisible(false)
    }
  }

  const handleClose = () => {
    setMessages([])
    setVisible(false)
  }


  const renderMessageHtml = (md: string) => {
    const html = marked.parse(md) as string
    return html
  }


  const onClickCopy = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target && target.matches('.ol-copy-btn')) {
      const pre = target.closest('.ol-code-wrap')?.querySelector('pre')
      const code = pre?.querySelector('code')
      const text = code?.textContent ?? ''
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        target.classList.add('copied')
        const original = target.textContent
        target.textContent = 'copied'
        setTimeout(() => {
          target.textContent = original || 'copy'
          target.classList.remove('copied')
        }, 1200)
      } catch (err) {
        console.error('copy fail:', err)
        target.textContent = 'copy fail'
        setTimeout(() => {
          target.textContent = 'copy'
        }, 1200)
      }
    }
  }

  const enhanceCodeBlocks = (html: string) => {

    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div class="__root">${html}</div>`, 'text/html')
    const pres = doc.querySelectorAll('pre')

    pres.forEach(pre => {
      const wrapper = doc.createElement('div')
      wrapper.className = 'ol-code-wrap'
      pre.parentNode?.insertBefore(wrapper, pre)
      wrapper.appendChild(pre)

      const btn = doc.createElement('button')
      btn.className = 'ol-copy-btn'
      btn.type = 'button'
      btn.textContent = 'copy'
      wrapper.appendChild(btn)
    })

    return doc.body.firstElementChild?.innerHTML || html
  }

  if (!visible) return null

  return (
    <div
      ref={toolbarRef}
      className="ol-cm-floating-toolbar"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: '50px',
        width: 'calc(100% - 50px)',
        boxSizing: 'border-box',
        padding: '0 16px',
        zIndex: 9999
      }}
    >
      <div 
        className="ol-cm-floating-toolbar-content"
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '10px'
        }}
      >
        <textarea
          ref={inputRef}
          value={annotation}
          onChange={e => setAnnotation(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI Assistant (Enter to send, Shift+Enter to newline)..."
          rows={1}
          style={{
            minHeight: '36px',
            resize: 'none',
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #D1D5DB',
            borderRadius: '20px',
            boxSizing: 'border-box',
            fontSize: '14px',
            lineHeight: '1.5',
            background: '#f9fafb',
            color: '#1f2937',
            transition: 'height 0.2s ease',
            overflowY: 'hidden',
            overflowX: 'hidden',
            outline: 'none'
          }}
        />
        <button 
          onClick={handleSend} 
          style={{ 
            flexShrink: 0,
            minWidth: '80px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 14px',
            borderRadius: '20px',
            border: 'none',
            background: '#098842',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          send
        </button>
        <button 
          onClick={handleClose}
          style={{ 
            flexShrink: 0,
            minWidth: '80px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 14px',
            borderRadius: '20px',
            border: 'none',
            background: '#4B5563',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          close
        </button>
      </div>

      <div
        ref={chatScrollRef}
        className="ol-chat-container"
        onClick={onClickCopy}
        style={{
          width: '100%',
          maxHeight: '260px',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: '#495365',
          borderRadius: '12px',
          padding: '12px 10px',
          boxSizing: 'border-box',
          boxShadow: '0 6px 16px rgba(0,0,0,0.15)'
        }}
      >
        <style>
          {`
          .ol-chat-container::-webkit-scrollbar {
            width: 8px;
          }
          .ol-chat-container::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.25);
            border-radius: 8px;
          }
          .ol-chat-msg {
            display: flex;
            margin: 8px 0;
          }
          .ol-chat-msg.user {
            justify-content: flex-end;
          }
          .ol-chat-msg.assistant {
            justify-content: flex-start;
          }
          .ol-avatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: rgba(255,255,255,0.9);
            flex: 0 0 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #495365;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          }
          .ol-bubble {
            max-width: 74%;
            padding: 10px 12px;
            border-radius: 14px;
            font-size: 14px;
            line-height: 1.6;
            color: #1F2937;
            background: #FFFFFF;
            box-shadow: 0 2px 10px rgba(0,0,0,0.12);
            word-break: break-word;
            overflow-wrap: anywhere;
            position: relative;
            overflow-x: hidden;
          }
          .ol-bubble.user {
            background: #A7F3D0;
          }
          .ol-meta {
            font-size: 12px;
            color: rgba(255,255,255,0.7);
            margin: 2px 6px;
          }
          .ol-msg-inner {
            display: flex;
            align-items: flex-end;
            gap: 8px;
          }
          .ol-msg-inner.user {
            flex-direction: row-reverse;
          }

          .ol-bubble h1, .ol-bubble h2, .ol-bubble h3 {
            margin: 6px 0 8px 0;
            color: #111827;
          }
          .ol-bubble p {
            margin: 6px 0;
            word-break: break-word;
            overflow-wrap: anywhere;
          }
          .ol-bubble ul, .ol-bubble ol {
            margin: 6px 0;
            padding-left: 20px;
          }
          .ol-bubble pre {
            background: #0B1020;
            color: #E5E7EB;
            padding: 12px 12px;
            border-radius: 10px;
            margin: 8px 0;
            white-space: pre-wrap;
            word-break: break-word;
            overflow-x: hidden;
            overflow-y: auto;
            max-height: 320px;
          }
          .ol-bubble code {
            background: #000000;
            padding: 1px 4px;
            border-radius: 4px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 0.95em;
            white-space: pre-wrap;
            word-break: break-word;
          }
          .ol-code-wrap {
            position: relative;
          }
          .ol-copy-btn {
            position: absolute;
            top: 6px;
            right: 8px;
            height: 26px;
            padding: 0 10px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 6px;
            background: rgba(255,255,255,0.08);
            color: #F9FAFB;
            font-size: 12px;
            cursor: pointer;
            transition: all .15s ease;
            backdrop-filter: blur(2px);
          }
          .ol-copy-btn:hover {
            background: rgba(255,255,255,0.18);
          }
          .ol-copy-btn.copied {
            border-color: #34D399;
            background: rgba(52,211,153,0.15);
            color: #ECFDF5;
          }
          .ol-lang-badge {
            position: absolute;
            top: 6px;
            left: 8px;
            height: 22px;
            padding: 0 8px;
            border-radius: 6px;
            background: rgba(255,255,255,0.12);
            color: #E5E7EB;
            font-size: 12px;
            line-height: 22px;
          }
          `}
        </style>

        {messages.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: '13px', padding: '8px 0' }}>
            AI Assistant is ready to help you.
          </div>
        )}

        {messages.map(m => {
          const isUser = m.role === 'user'
          const initials = isUser ? 'I' : 'AI'

          const rawHtml = renderMessageHtml(m.content)
          const enhancedHtml = enhanceCodeBlocks(rawHtml)

          return (
            <div key={m.id} className={`ol-chat-msg ${isUser ? 'user' : 'assistant'}`}>
              <div className={`ol-msg-inner ${isUser ? 'user' : ''}`}>
                <div className="ol-avatar" title={isUser ? 'I' : 'AI'}>{initials}</div>
                <div
                  className={`ol-bubble ${isUser ? 'user' : ''}`}
                  dangerouslySetInnerHTML={{ __html: enhancedHtml }}
                />
                <div className="ol-meta">{m.time}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default FloatingToolbar