import React from 'react';
import '../../styles/checkbox.css';

export interface CheckboxProps {
  /** Whether checkbox is checked */
  checked?: boolean;
  /** Change handler */
  onChange?: (checked: boolean) => void;
  /** Label text */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Whether checkbox is indeterminate */
  indeterminate?: boolean;
  /** Whether checkbox is disabled */
  disabled?: boolean;
  /** Error message */
  error?: string;
  /** Whether field is required */
  isRequired?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Checkbox component for multiple selections
 * Following Atlassian Design System principles
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  checked = false,
  onChange,
  label,
  helperText,
  indeterminate = false,
  disabled = false,
  error,
  isRequired = false,
  className = ''
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.checked);
  };

  const containerClass = [
    'atlas-checkbox-container',
    error && 'atlas-checkbox-container--error',
    className
  ].filter(Boolean).join(' ');

  const checkboxClass = [
    'atlas-checkbox',
    checked && 'atlas-checkbox--checked',
    indeterminate && 'atlas-checkbox--indeterminate',
    disabled && 'atlas-checkbox--disabled'
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      <label className="atlas-checkbox-label">
        <input
          ref={inputRef}
          type="checkbox"
          className="atlas-checkbox__input"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          aria-required={isRequired}
        />
        <span className={checkboxClass}>
          <span className="atlas-checkbox__control">
            {indeterminate ? (
              <svg className="atlas-checkbox__icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="atlas-checkbox__icon" viewBox="0 0 16 16" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M13.707 4.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L6 10.586l6.293-6.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </span>
        </span>
        {label && (
          <span className="atlas-checkbox__text">
            <span className="atlas-checkbox__label">
              {label}
              {isRequired && <span className="atlas-checkbox__required">*</span>}
            </span>
            {helperText && (
              <span className="atlas-checkbox__helper">{helperText}</span>
            )}
          </span>
        )}
      </label>

      {error && (
        <p className="atlas-checkbox__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * CheckboxGroup for multiple checkbox options
 */
export interface CheckboxGroupProps {
  /** Group label */
  label?: string;
  /** Children checkboxes */
  children: React.ReactNode;
  /** Error message */
  error?: string;
  /** Whether field is required */
  isRequired?: boolean;
  /** Custom class name */
  className?: string;
}

export const CheckboxGroup: React.FC<CheckboxGroupProps> = ({
  label,
  children,
  error,
  isRequired = false,
  className = ''
}) => {
  const containerClass = [
    'atlas-checkbox-group',
    error && 'atlas-checkbox-group--error',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass} role="group">
      {label && (
        <div className="atlas-checkbox-group__label">
          {label}
          {isRequired && <span className="atlas-checkbox-group__required">*</span>}
        </div>
      )}

      <div className="atlas-checkbox-group__options">
        {children}
      </div>

      {error && (
        <p className="atlas-checkbox-group__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Checkbox;
