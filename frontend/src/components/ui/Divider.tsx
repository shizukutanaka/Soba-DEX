import React from 'react';
import '../../styles/divider.css';

export interface DividerProps {
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Visual variant */
  variant?: 'solid' | 'dashed' | 'dotted';
  /** Spacing variant */
  spacing?: 'none' | 'sm' | 'md' | 'lg';
  /** Label text */
  label?: string;
  /** Label alignment */
  labelAlign?: 'left' | 'center' | 'right';
  /** Custom class name */
  className?: string;
}

/**
 * Divider component for visual separation
 * Following Atlassian Design System principles
 */
export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  variant = 'solid',
  spacing = 'md',
  label,
  labelAlign = 'center',
  className = ''
}) => {
  const dividerClass = [
    'atlas-divider',
    `atlas-divider--${orientation}`,
    `atlas-divider--${variant}`,
    `atlas-divider--spacing-${spacing}`,
    label && `atlas-divider--with-label atlas-divider--label-${labelAlign}`,
    className
  ].filter(Boolean).join(' ');

  if (label && orientation === 'horizontal') {
    return (
      <div className={dividerClass} role="separator">
        <span className="atlas-divider__label">{label}</span>
      </div>
    );
  }

  return <hr className={dividerClass} role="separator" />;
};

export default Divider;
