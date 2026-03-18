import { RefObject, useEffect } from "react";

type Options = {
  enabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  ignoreSelector?: string;
};

export function usePersistentGameInputFocus({
  enabled,
  inputRef,
  ignoreSelector = "[data-player-search-input='true']",
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    let rafId: number | null = null;

    const focusInput = () => {
      const input = inputRef.current;
      if (!input || input.disabled) return;
      if (document.activeElement === input) return;
      input.focus();
    };

    const scheduleFocus = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;

        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest(ignoreSelector)) {
          return;
        }

        focusInput();
      });
    };

    scheduleFocus();

    const onPointerDown = (event: PointerEvent | MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(ignoreSelector)) return;
      scheduleFocus();
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target === inputRef.current) return;
      if (target.closest(ignoreSelector)) return;
      scheduleFocus();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("focusin", onFocusIn, true);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("focusin", onFocusIn, true);
    };
  }, [enabled, ignoreSelector, inputRef]);
}