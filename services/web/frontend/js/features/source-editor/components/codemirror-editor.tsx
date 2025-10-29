// codemirror-editor.tsx
import { ElementType, memo, useRef, useState, useEffect } from 'react'
import useIsMounted from '../../../shared/hooks/use-is-mounted'
import { EditorView } from '@codemirror/view'
import { EditorState, Transaction, StateEffect } from '@codemirror/state'
import CodeMirrorView from './codemirror-view'
import CodeMirrorSearch from './codemirror-search'
import { CodeMirrorToolbar } from './codemirror-toolbar'
import { CodemirrorOutline } from './codemirror-outline'
import { CodeMirrorCommandTooltip } from './codemirror-command-tooltip'
import { dispatchTimer } from '../../../infrastructure/cm6-performance'
import importOverleafModules from '../../../../macros/import-overleaf-module.macro'
import { FigureModal } from './figure-modal/figure-modal'
import LLMToolbar from './llm-toolbar'
import { ReviewPanelProviders } from '@/features/review-panel-new/context/review-panel-providers'
import { ReviewPanelMigration } from '@/features/source-editor/components/review-panel/review-panel-migration'
import ReviewTooltipMenu from '@/features/review-panel-new/components/review-tooltip-menu'
import { useFeatureFlag } from '@/shared/context/split-test-context'
import {
  CodeMirrorStateContext,
  CodeMirrorViewContext,
} from './codemirror-context'


import { inlineCompletionExtension, INLINE_COMPLETION_PLUGIN } from './llm-completion'

// TODO: remove this when definitely no longer used
export * from './codemirror-context'

const sourceEditorComponents = importOverleafModules(
  'sourceEditorComponents'
) as { import: { default: ElementType }; path: string }[]

const sourceEditorToolbarComponents = importOverleafModules(
  'sourceEditorToolbarComponents'
) as { import: { default: ElementType }; path: string }[]

function CodeMirrorEditor() {
  // create the initial state
  const [state, setState] = useState(() => {
    return EditorState.create()
  })

  const isMounted = useIsMounted()

  const newReviewPanel = useFeatureFlag('review-panel-redesign')

  // create the view using the initial state and intercept transactions
  const viewRef = useRef<EditorView | null>(null)
  const llmToolbarref = useRef<FloatingToolbarHandle>(null)
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null)

  // Handle text selection changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const handleSelectionChange = () => {
      const selection = view.state.selection.main

      // Skip if selection hasn't changed
      if (lastSelectionRef.current &&
        lastSelectionRef.current.from === selection.from &&
        lastSelectionRef.current.to === selection.to) {
        return
      }
      lastSelectionRef.current = { from: selection.from, to: selection.to }

      if (!selection.empty && llmToolbarref.current) {
        llmToolbarref.current.show(view)
      } else if (llmToolbarref.current) {
        llmToolbarref.current.hide()
      }
    }

    // Initial check
    handleSelectionChange()

    // Listen for selection changes
    view.dom.addEventListener('mouseup', handleSelectionChange)
    view.dom.addEventListener('keyup', handleSelectionChange)

    return () => {
      view.dom.removeEventListener('mouseup', handleSelectionChange)
      view.dom.removeEventListener('keyup', handleSelectionChange)
    }
  }, [])

  if (viewRef.current === null) {
    const timer = dispatchTimer()

    // @ts-ignore (disable EditContext-based editing until stable)
    EditorView.EDIT_CONTEXT = false

    const view = new EditorView({
      state,
      dispatchTransactions: (trs: readonly Transaction[]) => {
        timer.start(trs)
        view.update(trs)
        if (isMounted.current) {
          setState(view.state)
        }

        timer.end(trs, view)


        try {
          const hasPlugin = !!(view.plugin && view.plugin(INLINE_COMPLETION_PLUGIN))
          if (!hasPlugin) {

            setTimeout(() => {
              try {
                view.dispatch({
                  effects: StateEffect.appendConfig.of([inlineCompletionExtension()])
                })
                console.debug("[CodeMirrorEditor] re-appended inlineCompletionExtension (plugin missing after transaction).")
              } catch (e) {
                console.error("[CodeMirrorEditor] failed to re-append inlineCompletionExtension:", e)
              }
            }, 0)
          }
        } catch (e) {
          console.error("[CodeMirrorEditor] plugin existence check failed:", e)
        }
      },
    })


    try { (window as any).__cm_view_for_debug = view } catch (e){}

    viewRef.current = view


    setTimeout(() => {
      try {
        view.dispatch({
          effects: StateEffect.appendConfig.of([inlineCompletionExtension()])
        })
        console.debug("[CodeMirrorEditor] appended inlineCompletionExtension to view (initial).")
      } catch (e) {
        console.error("[CodeMirrorEditor] append inlineCompletionExtension failed (initial):", e);
      }
    }, 50);


    if (isMounted.current) {
      setState(view.state)
    }
  }

  return (
    <CodeMirrorStateContext.Provider value={state}>
      <CodeMirrorViewContext.Provider value={viewRef.current}>
        <ReviewPanelProviders>
          <CodemirrorOutline />
          <CodeMirrorView />
          <FigureModal />
          <CodeMirrorSearch />
          <CodeMirrorToolbar />
          {sourceEditorToolbarComponents.map(
            ({ import: { default: Component }, path }) => (
              <Component key={path} />
            )
          )}
          <CodeMirrorCommandTooltip />

          {newReviewPanel && <ReviewTooltipMenu />}
          <ReviewPanelMigration />

          {sourceEditorComponents.map(
            ({ import: { default: Component }, path }) => (
              <Component key={path} />
            )
          )}

          <LLMToolbar ref={llmToolbarref} />
        </ReviewPanelProviders>
      </CodeMirrorViewContext.Provider>
    </CodeMirrorStateContext.Provider>
  )
}

export default memo(CodeMirrorEditor)
