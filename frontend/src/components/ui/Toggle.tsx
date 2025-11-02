import React from 'react';
import '../../styles/toggle.css';

export interface ToggleProps {
  /** Whether toggle is checked */
  checked?: boolean;
  /** Change handler */
  onChange?: (checked: boolean) => void;
  /** Label text */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Whether toggle is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom class name */
  className?: string;
}

/**
 * Toggle component for binary choices
 * Following Atlassian Design System principles
 */
export const Toggle: React.FC<ToggleProps> = ({
  checked = false,
  onChange,
  label,
  helperText,
  disabled = false,
  size = 'md',
  className = ''
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.checked);
  };

  const containerClass = [
    'atlas-toggle-container',
    className
  ].filter(Boolean).join(' ');

  const toggleClass = [
    'atlas-toggle',
    `atlas-toggle--${size}`,
    checked && 'atlas-toggle--checked',
    disabled && 'atlas-toggle--disabled'
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      <label className="atlas-toggle-label">
        <input
          type="checkbox"
          className="atlas-toggle__input"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          role="switch"
          aria-checked={checked}
        />
        <span className={toggleClass}>
          <span className="atlas-toggle__track" />
          <span className="atlas-toggle__thumb" />
        </span>
        {label && (
          <span className="atlas-toggle__text">
            <span className="atlas-toggle__label-text">{label}</span>
            {helperText && (
              <span className="atlas-toggle__helper">{helperText}</span>
            )}
          </span>
        )}
      </label>
    </div>
  );
};

export default Toggle;
