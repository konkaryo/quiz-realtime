"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PreviewOption = { value: string; label: string };

type PreviewSelectProps = {
  title?: string;
  options?: PreviewOption[];
  value?: string;
  isDisabled?: boolean;
  onChange?: (value: string) => void;
};

type PreviewMultiSelectProps = {
  title?: string;
  options?: PreviewOption[];
  value: string[];
  className?: string;
  isDisabled?: boolean;
  onChange?: (value: string[]) => void;
};

function SelectShell({ title, valueLabel, isDisabled, open, setOpen, wrapRef, dropdownRef, children, className = "", dropdownClassName = "" }: { title: string; valueLabel: string; isDisabled: boolean; open: boolean; setOpen: (open: boolean) => void; wrapRef: React.RefObject<HTMLDivElement | null>; dropdownRef: React.RefObject<HTMLDivElement | null>; children: ReactNode; className?: string; dropdownClassName?: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !dropdownRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, setOpen, wrapRef, dropdownRef]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => wrapRef.current && setRect(wrapRef.current.getBoundingClientRect());
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, wrapRef]);

  return (
    <div className={`scrubber ${className}`.trim()} ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" className="scrubber-track scrubber-track--select" aria-label={title} aria-expanded={open} aria-disabled={isDisabled} data-disabled={isDisabled} tabIndex={isDisabled ? -1 : 0} onClick={() => !isDisabled && setOpen(!open)}>
        <span className="scrubber-label">{title}</span>
        <span className="scrubber-select-right">
          <span className="scrubber-value">{valueLabel}</span>
          <svg className={`scrubber-caret${open ? " scrubber-caret--open" : ""}`} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      {open && rect && createPortal(<div ref={dropdownRef} className={`scrubber-dropdown ${dropdownClassName}`.trim()} style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, right: "auto", width: rect.width, zIndex: 9999 }}>{children}</div>, document.body)}
    </div>
  );
}

export function PreviewSelect({ title = "", options = [], value = "", isDisabled = false, onChange }: PreviewSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const labelMap = useMemo(() => Object.fromEntries(options.map((option) => [option.value, option.label])), [options]);

  return <SelectShell title={title} valueLabel={labelMap[value] || value} isDisabled={isDisabled} open={open} setOpen={setOpen} wrapRef={wrapRef} dropdownRef={dropdownRef}>{options.map((option) => <button key={option.value} type="button" className={`scrubber-dropdown-item${option.value === value ? " scrubber-dropdown-item--active" : ""}`} onClick={() => { onChange?.(option.value); setOpen(false); }}>{option.label}</button>)}</SelectShell>;
}

export function PreviewMultiSelect({ title = "", options = [], value, className = "", isDisabled = false, onChange }: PreviewMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const summary = value.length === options.length ? "Tous les thèmes" : value.length === 1 ? options.find((option) => option.value === value[0])?.label || "1 thème" : `${value.length} thèmes`;
  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      if (value.length > 1) onChange?.(value.filter((item) => item !== optionValue));
    } else onChange?.([...value, optionValue]);
  };

  return <SelectShell title={title} valueLabel={summary} isDisabled={isDisabled} open={open} setOpen={setOpen} wrapRef={wrapRef} dropdownRef={dropdownRef} className={className} dropdownClassName="scrubber-dropdown--multi">{options.map((option) => { const active = value.includes(option.value); return <button key={option.value} type="button" className={`scrubber-dropdown-item scrubber-dropdown-item--check${active ? " scrubber-dropdown-item--active" : ""}`} aria-pressed={active} onClick={() => toggle(option.value)}><span>{option.label}</span><span aria-hidden="true">{active ? "✓" : ""}</span></button>; })}</SelectShell>;
}