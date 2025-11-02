import React from 'react';
import '../../styles/spinner.css';

export interface SpinnerProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Color variant */
  variant?: 'primary' | 'secondary' | 'light' | 'dark';
  /** Label for accessibility */
  label?: string;
  /** Custom class name */
  className?: string;
}

/**
 * Spinner component for loading states
 * Following Atlassian Design System principles
 */
export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  label = 'Loading...',
  className = ''
}) => {
  const spinnerClass = [
    'atlas-spinner',
    `atlas-spinner--${size}`,
    `atlas-spinner--${variant}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={spinnerClass} role="status" aria-label={label}>
      <svg className="atlas-spinner__svg" viewBox="0 0 50 50">
        <circle
          className="atlas-spinner__circle"
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth="5"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
};

/**
 * Inline spinner for buttons and small spaces
 */
export const InlineSpinner: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`atlas-inline-spinner ${className}`} role="status" aria-label="Loading">
    <svg className="atlas-inline-spinner__svg" viewBox="0 0 24 24">
      <circle
        className="atlas-inline-spinner__circle"
        cx="12"
        cy="12"
        r="10"
        fill="none"
        strokeWidth="3"
      />
    </svg>
  </span>
);

export default Spinner;
