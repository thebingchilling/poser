/** MD3 linear progress; indeterminate when value is undefined. */
export function LinearProgress({ value, label }: { value?: number; label: string }) {
  return (
    <div
      className={`md-linear-progress${value === undefined ? ' md-linear-progress--indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === undefined ? undefined : Math.round(value * 100)}
    >
      <div className="md-linear-progress__bar" style={value === undefined ? undefined : { width: `${value * 100}%` }} />
    </div>
  );
}
