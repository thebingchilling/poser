import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  supporting?: string;
  error?: string | null;
}

/** MD3 outlined text field. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, supporting, error, className, ...rest }, ref) {
  const id = useId();
  return (
    <div className={`md-text-field${error ? ' md-text-field--error' : ''}${className ? ' ' + className : ''}`}>
      <input ref={ref} id={id} className="md-text-field__input" placeholder=" " aria-invalid={!!error} aria-describedby={`${id}-sup`} {...rest} />
      <label htmlFor={id} className="md-text-field__label">
        {label}
      </label>
      {(error || supporting) && (
        <span id={`${id}-sup`} className="md-text-field__supporting">
          {error || supporting}
        </span>
      )}
    </div>
  );
});
