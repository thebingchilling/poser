import * as RadixSlider from '@radix-ui/react-slider';
import { useId, useState } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  /** Called when a drag ends (e.g. to close an undo step). */
  onCommit?: (value: number) => void;
  disabled?: boolean;
  /** Shown and typed values are value × displayScale (e.g. 100 for a percentage). */
  displayScale?: number;
  /** Custom text for the value; typed entries are still parsed as numbers. */
  format?: (value: number) => string;
}

function decimalsFor(step: number): number {
  return Math.max(0, Math.min(6, Math.ceil(-Math.log10(step) - 1e-9)));
}

/** MD3 slider with a value label and number entry (PLAN.md section 3.1). */
export function Slider({ label, value, min = 0, max = 1, step = 0.01, unit, onChange, onCommit, disabled, displayScale = 1, format }: SliderProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = format ? format(value) : (Math.round(value / step) * step * displayScale).toFixed(decimalsFor(step * displayScale));
  const commitDraft = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.')) / displayScale;
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      onChange(clamped);
      onCommit?.(clamped);
    }
    setDraft(null);
  };
  return (
    <div className="md-slider" data-disabled={disabled || undefined}>
      <div className="md-slider__top">
        <label className="md-slider__label" id={`${id}-label`} htmlFor={`${id}-input`}>
          {label}
        </label>
        <span className="md-slider__value">
          <input
            id={`${id}-input`}
            className="md-slider__input"
            inputMode="decimal"
            disabled={disabled}
            value={draft ?? shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
          {unit && <span className="md-slider__unit">{unit}</span>}
        </span>
      </div>
      <RadixSlider.Root
        className="md-slider__root"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        onValueCommit={([v]) => v !== undefined && onCommit?.(v)}
        aria-labelledby={`${id}-label`}
      >
        <RadixSlider.Track className="md-slider__track">
          <RadixSlider.Range className="md-slider__range" />
        </RadixSlider.Track>
        <RadixSlider.Thumb className="md-slider__thumb" aria-labelledby={`${id}-label`} />
      </RadixSlider.Root>
    </div>
  );
}
