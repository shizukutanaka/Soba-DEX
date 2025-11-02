import React from 'react';
import '../../styles/progress.css';

export interface ProgressProps {
  /** Current progress value (0-100) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Visual variant */
  variant?: 'default' | 'success' | 'warning' | 'danger';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show percentage label */
  showLabel?: boolean;
  /** Custom label */
  label?: string;
  /** Whether progress is indeterminate */
  indeterminate?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Progress component for showing completion status
 */
export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  variant = 'default',
  size = 'md',
  showLabel = false,
  label,
  indeterminate = false,
  className = ''
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const baseClass = 'atlas-progress';
  const variantClass = `atlas-progress--${variant}`;
  const sizeClass = `atlas-progress--${size}`;
  const indeterminateClass = indeterminate ? 'atlas-progress--indeterminate' : '';

  const classNames = [
    baseClass,
    variantClass,
    sizeClass,
    indeterminateClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="atlas-progress-container">
      {(showLabel || label) && (
        <div className="atlas-progress-label">
          <span>{label || `${Math.round(percentage)}%`}</span>
        </div>
      )}
      <div
        className={classNames}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className="atlas-progress__bar"
          style={{ width: indeterminate ? '100%' : `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Circular Progress component
 */
export interface CircularProgressProps {
  /** Current progress value (0-100) */
  value?: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Visual variant */
  variant?: 'default' | 'success' | 'warning' | 'danger';
  /** Whether progress is indeterminate */
  indeterminate?: boolean;
  /** Show percentage in center */
  showLabel?: boolean;
  /** Custom class name */
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value = 0,
  size = 48,
  strokeWidth = 4,
  variant = 'default',
  indeterminate = false,
  showLabel = false,
  className = ''
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  const classNames = [
    'atlas-circular-progress',
    `atlas-circular-progress--${variant}`,
    indeterminate && 'atlas-circular-progress--indeterminate',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className="atlas-circular-progress-container" style={{ width: size, height: size }}>
      <svg className={classNames} width={size} height={size}>
        <circle
          className="atlas-circular-progress__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          className="atlas-circular-progress__bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={indeterminate ? 0 : offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showLabel && !indeterminate && (
        <span className="atlas-circular-progress__label">{Math.round(value)}%</span>
      )}
    </div>
  );
};

export default Progress;
