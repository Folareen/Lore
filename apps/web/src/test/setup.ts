// JSDOM lacks the layout and pointer APIs used by accessible popover primitives.
if (typeof window !== 'undefined') {
  window.PointerEvent ??= MouseEvent as typeof PointerEvent;
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
  HTMLElement.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
