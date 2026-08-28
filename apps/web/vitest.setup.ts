import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// @testing-library/dom's `waitFor` (used by `findBy*` queries) only detects
// fake timers via a global `jest` object; it never recognizes Vitest's
// `vi.useFakeTimers()` on its own, which then leaves it stuck waiting on a
// real `setTimeout` that fake timers never fire. Aliasing `jest` to `vi`
// (API-compatible) lets that detection work correctly.
;(globalThis as unknown as { jest: typeof vi }).jest = vi

// jsdom has no layout engine, so getBoundingClientRect always returns zeros.
// react-chessboard reads the source square's width to animate piece moves and
// throws when it is 0. Give board elements a non-zero size in tests.
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect
Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const rect = originalGetBoundingClientRect.call(this)
  return {
    ...rect,
    width: rect.width || 100,
    height: rect.height || 100,
  }
}
