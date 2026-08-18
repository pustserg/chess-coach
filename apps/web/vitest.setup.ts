import '@testing-library/jest-dom/vitest'

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
