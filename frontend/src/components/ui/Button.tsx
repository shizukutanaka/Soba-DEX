import React from 'react';
import '../../styles/button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Whether the button spans full width */
  fullWidth?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Icon to display before text */
  iconBefore?: React.ReactNode;
  /** Icon to display after text */
  iconAfter?: React.ReactNode;
  /** Children content */
  children: React.ReactNode;
}

/**
 * Button component following Atlassian Design System principles
 * - Clear visual hierarchy with variants
 * - Loading and disabled states
 * - Keyboard accessible
 * - ARIA compliant
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  disabled = false,
  iconBefore,
  iconAfter,
  children,
  className = '',
  type = 'button',
  ...props
}) => {
  const baseClass = 'atlas-button';
  const variantClass = `atlas-button--${variant}`;
  const sizeClass = `atlas-button--${size}`;
  const fullWidthClass = fullWidth ? 'atlas-button--full' : '';
  const loadingClass = isLoading ? 'atlas-button--loading' : '';
  const disabledClass = disabled || isLoading ? 'atlas-button--disabled' : '';

  const classNames = [
    baseClass,
    variantClass,
    sizeClass,
    fullWidthClass,
    loadingClass,
    disabledClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classNames}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading && (
        <span className="atlas-button__spinner" aria-hidden="true">
          <svg className="atlas-button__spinner-svg" viewBox="0 0 24 24" aria-hidden="true">
            <circle
              className="atlas-button__spinner-circle"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              strokeWidth="3"
            />
          </svg>
        </span>
      )}
      {!isLoading && iconBefore && (
        <span className="atlas-button__icon-before" aria-hidden="true">
          {iconBefore}
        </span>
      )}
      <span className="atlas-button__text">{children}</span>
      {!isLoading && iconAfter && (
        <span className="atlas-button__icon-after" aria-hidden="true">
          {iconAfter}
        </span>
      )}
    </button>
  );
};

export default Button;
