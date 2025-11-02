import React from 'react';
import '../../styles/radio.css';

export interface RadioOption {
  value: string;
  label: string;
  helperText?: string;
  disabled?: boolean;
}

export interface RadioProps {
  /** Radio options */
  options: RadioOption[];
  /** Selected value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Group name */
  name: string;
  /** Group label */
  label?: string;
  /** Layout direction */
  direction?: 'vertical' | 'horizontal';
  /** Whether field is required */
  isRequired?: boolean;
  /** Error message */
  error?: string;
  /** Custom class name */
  className?: string;
}

/**
 * Radio component for single selection
 * Following Atlassian Design System principles
 */
export const Radio: React.FC<RadioProps> = ({
  options,
  value,
  onChange,
  name,
  label,
  direction = 'vertical',
  isRequired = false,
  error,
  className = ''
}) => {
  const containerClass = [
    'atlas-radio-group',
    `atlas-radio-group--${direction}`,
    error && 'atlas-radio-group--error',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass} role="radiogroup" aria-required={isRequired}>
      {label && (
        <div className="atlas-radio-group__label">
          {label}
          {isRequired && <span className="atlas-radio-group__required">*</span>}
        </div>
      )}

      <div className="atlas-radio-group__options">
        {options.map((option) => {
          const isChecked = option.value === value;
          const isDisabled = option.disabled;

          return (
            <label
              key={option.value}
              className={[
                'atlas-radio',
                isChecked && 'atlas-radio--checked',
                isDisabled && 'atlas-radio--disabled'
              ].filter(Boolean).join(' ')}
            >
              <input
                type="radio"
                className="atlas-radio__input"
                name={name}
                value={option.value}
                checked={isChecked}
                onChange={(e) => onChange?.(e.target.value)}
                disabled={isDisabled}
              />
              <span className="atlas-radio__control">
                <span className="atlas-radio__indicator" />
              </span>
              <span className="atlas-radio__text">
                <span className="atlas-radio__label">{option.label}</span>
                {option.helperText && (
                  <span className="atlas-radio__helper">{option.helperText}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <p className="atlas-radio-group__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Radio;
