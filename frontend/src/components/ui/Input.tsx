import React, { forwardRef } from 'react';
import '../../styles/input.css';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text */
  label?: string;
  /** Helper text below input */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Whether the field is required */
  isRequired?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Icon to display before input */
  iconBefore?: React.ReactNode;
  /** Icon to display after input */
  iconAfter?: React.ReactNode;
  /** Full width */
  fullWidth?: boolean;
  /** Input size */
  inputSize?: 'sm' | 'md' | 'lg';
}

/**
 * Input component following Atlassian Design System principles
 * - Clear validation states
 * - Accessible labels and error messages
 * - Supports icons and helper text
 * - ARIA compliant
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      isRequired = false,
      disabled = false,
      iconBefore,
      iconAfter,
      fullWidth = false,
      inputSize = 'md',
      id,
      className = '',
      'aria-describedby': ariaDescribedby,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const helperTextId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;
    const hasError = Boolean(error);

    const describedBy = [
      ariaDescribedby,
      helperText && helperTextId,
      error && errorId
    ].filter(Boolean).join(' ');

    const containerClass = [
      'atlas-input-container',
      fullWidth && 'atlas-input-container--full',
      className
    ].filter(Boolean).join(' ');

    const wrapperClass = [
      'atlas-input-wrapper',
      `atlas-input-wrapper--${inputSize}`,
      hasError && 'atlas-input-wrapper--error',
      disabled && 'atlas-input-wrapper--disabled',
      iconBefore && 'atlas-input-wrapper--with-icon-before',
      iconAfter && 'atlas-input-wrapper--with-icon-after'
    ].filter(Boolean).join(' ');

    return (
      <div className={containerClass}>
        {label && (
          <label htmlFor={inputId} className="atlas-input-label">
            {label}
            {isRequired && <span className="atlas-input-required" aria-label="required">*</span>}
          </label>
        )}

        <div className={wrapperClass}>
          {iconBefore && (
            <span className="atlas-input-icon atlas-input-icon--before" aria-hidden="true">
              {iconBefore}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className="atlas-input"
            disabled={disabled}
            aria-required={isRequired}
            aria-invalid={hasError}
            aria-describedby={describedBy || undefined}
            {...props}
          />

          {iconAfter && (
            <span className="atlas-input-icon atlas-input-icon--after" aria-hidden="true">
              {iconAfter}
            </span>
          )}
        </div>

        {helperText && !error && (
          <p id={helperTextId} className="atlas-input-helper">
            {helperText}
          </p>
        )}

        {error && (
          <p id={errorId} className="atlas-input-error" role="alert">
            <svg
              className="atlas-input-error-icon"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"
              />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
