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
import {
  getBrowserAddressBarInlineCompletion,
  type BrowserAddressBarSuggestion
} from './browser-address-bar-suggestions'

export type BrowserAddressBarInlineCompletion = { url: string; text: string }

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
  inline: BrowserAddressBarInlineCompletion | null
  /** The bar text for this edit when it completes inline; null keeps what was typed. */
  completeTyping: (event: ChangeEvent<HTMLInputElement>, typed: string) => string | null
  clearInline: () => void
  /** Moving the caret off the completion (ArrowRight, End, a click) accepts it as typed text. */
  acceptOnCaretMove: (event: SyntheticEvent<HTMLInputElement>) => void
} {
  const [inline, setInline] = useState<BrowserAddressBarInlineCompletion | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const range = pendingSelectionRef.current
    const input = inputRef.current
    if (!range || !input || input.value !== inline?.text) {
      return
    }
    pendingSelectionRef.current = null
    input.setSelectionRange(range.start, range.end)
  }, [inline, inputRef, value])

  const completeTyping = useCallback(
    (event: ChangeEvent<HTMLInputElement>, typed: string): string | null => {
      const completion = findInlineCompletion(event, typed, buildSuggestions)
      setInline(completion)
      if (!completion) {
        return null
      }
      pendingSelectionRef.current = { start: typed.length, end: completion.text.length }
      return completion.text
    },
    [buildSuggestions]
  )

  const clearInline = useCallback(() => setInline(null), [])

  const acceptOnCaretMove = useCallback(
    (event: SyntheticEvent<HTMLInputElement>): void => {
      const input = event.currentTarget
      const typed = prePreviewValueRef.current
      if (
        !inline ||
        typed === null ||
        input.value !== inline.text ||
        (input.selectionStart === typed.length && input.selectionEnd === inline.text.length)
      ) {
        return
      }
      // Why: otherwise a later blur or Escape would put the bar back to the typed prefix.
      prePreviewValueRef.current = null
      setInline(null)
    },
    [inline, prePreviewValueRef]
  )

  return { inline, completeTyping, clearInline, acceptOnCaretMove }
}

// Why typing only: like Chrome, a paste, an IME composition or a deletion never completes,
// so Backspace removes the completion instead of bringing it straight back.
function findInlineCompletion(
  event: ChangeEvent<HTMLInputElement>,
  typed: string,
  buildSuggestions: (query: string, inlineAllowed: boolean) => BrowserAddressBarSuggestion[]
): BrowserAddressBarInlineCompletion | null {
  const native = event.nativeEvent
  if (
    !(native instanceof InputEvent) ||
    native.inputType !== 'insertText' ||
    event.target.selectionStart !== typed.length
  ) {
    return null
  }
  const top = buildSuggestions(typed, true)[0]
  if (!top || top.isSearch || top.docLocation) {
    return null
  }
  const completion = getBrowserAddressBarInlineCompletion(typed, top.url)
  return completion && completion.text.length > typed.length ? completion : null
}
