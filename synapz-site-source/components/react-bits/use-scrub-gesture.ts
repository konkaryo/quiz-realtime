import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const INTENT_THRESHOLD_PX = 6;

type ScrubGestureOptions = {
  trackRef: RefObject<HTMLDivElement | null>;
  computeValue: (clientX: number) => number;
  onChange?: (value: number) => void;
  isDisabled: boolean;
};

export function useScrubGesture({ trackRef, computeValue, onChange, isDisabled }: ScrubGestureOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const pendingRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const begin = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setIsDragging(true);
    trackRef.current?.setPointerCapture(event.pointerId);
    onChange?.(computeValue(event.clientX));
  }, [trackRef, computeValue, onChange]);

  const end = useCallback(() => {
    draggingRef.current = false;
    pendingRef.current = null;
    setIsDragging(false);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    if (event.pointerType === "touch") {
      pendingRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    event.preventDefault();
    begin(event);
  }, [isDisabled, begin]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pending = pendingRef.current;
    if (pending) {
      if (event.pointerId !== pending.id) return;
      const dx = event.clientX - pending.x;
      const dy = event.clientY - pending.y;
      if (Math.abs(dx) < INTENT_THRESHOLD_PX && Math.abs(dy) < INTENT_THRESHOLD_PX) return;
      pendingRef.current = null;
      if (Math.abs(dy) >= Math.abs(dx)) return;
      begin(event);
      return;
    }
    if (!draggingRef.current) return;
    onChange?.(computeValue(event.clientX));
  }, [begin, computeValue, onChange]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pendingRef.current?.id === event.pointerId) onChange?.(computeValue(event.clientX));
    end();
  }, [computeValue, onChange, end]);

  const onPointerCancel = useCallback(() => end(), [end]);

  return { isDragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
