import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
  type RefObject,
  type SyntheticEvent
} from 'react'
import type { BrowserAddressBarSuggestion } from './browser-address-bar-suggestions'

/**
 * Chrome-style inline autocomplete: typing the start of a visited address fills in the rest,
 * selected, so Enter goes there and the next keystroke simply replaces it.
 */
export function useBrowserAddressBarInlineCompletion({
  inputRef,
  value,
  buildSuggestions,
  prePreviewValueRef
}: {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  buildSuggestions: (query: string, inlineAllowed: boolean) => BrowserAddressBarSuggestion[]
  /** Holds the typed text while a completion shows; cleared once the completion is accepted. */
  prePreviewValueRef: MutableRefObject<string | null>
}): {
  /** The bar text while an inline completion shows. */
  inlineText: string | null
  /** The bar text for this edit when it completes inline; null keeps what was typed. */
  completeTyping: (event: ChangeEvent<HTMLInputElement>, typed: string) => string | null
  clearInline: () => void
  /** Moving the caret off the completion (ArrowRight, End, a click) accepts it as typed text. */
  acceptOnCaretMove: (event: SyntheticEvent<HTMLInputElement>) => void
} {
  const [inlineText, setInlineText] = useState<string | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const range = pendingSelectionRef.current
    const input = inputRef.current
    if (!range || !input || input.value !== inlineText) {
      return
    }
    pendingSelectionRef.current = null
    input.setSelectionRange(range.start, range.end)
  }, [inlineText, inputRef, value])

  const completeTyping = useCallback(
    (event: ChangeEvent<HTMLInputElement>, typed: string): string | null => {
      const text = isTypingAtEnd(event, typed)
        ? (buildSuggestions(typed, true)[0]?.inlineText ?? null)
        : null
      const completed = text !== null && text.length > typed.length ? text : null
      setInlineText(completed)
      if (completed !== null) {
        pendingSelectionRef.current = { start: typed.length, end: completed.length }
      }
      return completed
    },
    [buildSuggestions]
  )

  const clearInline = useCallback(() => setInlineText(null), [])

  const acceptOnCaretMove = useCallback(
    (event: SyntheticEvent<HTMLInputElement>): void => {
      const input = event.currentTarget
      const typed = prePreviewValueRef.current
      if (
        inlineText === null ||
        typed === null ||
        input.value !== inlineText ||
        (input.selectionStart === typed.length && input.selectionEnd === inlineText.length)
      ) {
        return
      }
      // Why: otherwise a later blur or Escape would put the bar back to the typed prefix.
      prePreviewValueRef.current = null
      setInlineText(null)
    },
    [inlineText, prePreviewValueRef]
  )

  return { inlineText, completeTyping, clearInline, acceptOnCaretMove }
}

// Why typing only: like Chrome, a paste, an IME composition or a deletion never completes,
// so Backspace removes the completion instead of bringing it straight back.
function isTypingAtEnd(event: ChangeEvent<HTMLInputElement>, typed: string): boolean {
  const native = event.nativeEvent
  return (
    native instanceof InputEvent &&
    native.inputType === 'insertText' &&
    event.target.selectionStart === typed.length
  )
}
