"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useScrubGesture } from "./use-scrub-gesture";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const stepDecimals = (step: number) => {
  const value = step.toString();
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
};
const roundToStep = (value: number, step: number, min: number) => {
  const raw = Math.round((value - min) / step) * step + min;
  const decimals = Math.max(stepDecimals(step), stepDecimals(min));
  return Number(raw.toFixed(decimals));
};

type PreviewSliderProps = {
  title?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  valueUnit?: string;
  isDisabled?: boolean;
  displayValue?: (value: number) => string;
  onChange?: (value: number) => void;
};

export function PreviewSlider({ title = "", min = 0, max = 100, step = 1, value = 0, valueUnit = "", isDisabled = false, displayValue, onChange }: PreviewSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  const range = max - min;
  const percentage = range > 0 ? ((value - min) / range) * 100 : 0;

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    setIsHoverDevice(query.matches);
    const handleChange = (event: MediaQueryListEvent) => setIsHoverDevice(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  const computeValue = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return clamp(roundToStep(min + ratio * range, step, min), min, max);
  }, [min, max, step, range, value]);

  const gesture = useScrubGesture({ trackRef, computeValue, onChange, isDisabled });
  const isActive = gesture.isDragging || (isHoverDevice && isHovering);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight": case "ArrowUp": next = value + step; break;
      case "ArrowLeft": case "ArrowDown": next = value - step; break;
      case "Home": next = min; break;
      case "End": next = max; break;
      default: return;
    }
    event.preventDefault();
    onChange?.(clamp(roundToStep(next, step, min), min, max));
  }, [value, step, min, max, onChange, isDisabled]);

  const formattedValue = displayValue ? displayValue(value) : `${Number(value.toFixed(stepDecimals(step)))}${valueUnit}`;

  return (
    <div className="scrubber">
      <div className="scrubber-track" ref={trackRef} role="slider" aria-label={title} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-disabled={isDisabled} tabIndex={isDisabled ? -1 : 0} data-dragging={gesture.isDragging} data-disabled={isDisabled} data-active={isActive} onPointerDown={gesture.onPointerDown} onPointerMove={gesture.onPointerMove} onPointerUp={gesture.onPointerUp} onPointerCancel={gesture.onPointerCancel} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)} onKeyDown={handleKeyDown}>
        <div className="scrubber-fill" style={{ width: `${percentage}%` }} />
        <div className="scrubber-ticks">{Array.from({ length: 9 }, (_, index) => <div className="scrubber-tick" key={index} style={{ left: `${((index + 1) / 10) * 100}%` }} />)}</div>
        <div className="scrubber-thumb-wrapper" style={{ left: `${percentage}%` }}><div className="scrubber-thumb" /></div>
        <div className="scrubber-label">{title}</div>
        <div className="scrubber-value">{formattedValue}</div>
      </div>
    </div>
  );
}