"use client";

type PreviewSwitchProps = {
  title: string;
  isChecked: boolean;
  onChange?: (value: boolean) => void;
  isDisabled?: boolean;
};

export function PreviewSwitch({ title, isChecked, onChange, isDisabled = false }: PreviewSwitchProps) {
  const handleChange = () => {
    if (!isDisabled) onChange?.(!isChecked);
  };
  return (
    <div className="scrubber">
      <button type="button" className="scrubber-track scrubber-track--switch" role="switch" aria-checked={isChecked} aria-label={title} aria-disabled={isDisabled} data-disabled={isDisabled} data-checked={isChecked} tabIndex={isDisabled ? -1 : 0} onClick={handleChange} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); handleChange(); } }}>
        <span className="scrubber-label">{title}</span>
        <span className="scrubber-switch-toggle"><span className="scrubber-switch-knob" /></span>
      </button>
    </div>
  );
}
