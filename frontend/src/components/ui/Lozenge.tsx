import React from 'react';
import '../../styles/lozenge.css';

export type LozengeType = 'default' | 'success' | 'warning' | 'error' | 'info' | 'new' | 'removed';

export interface LozengeProps {
  /** Lozenge content */
  children: React.ReactNode;
  /** Visual style variant */
  type?: LozengeType;
  /** Size variant */
  size?: 'small' | 'medium';
  /** Whether lozenge is subtle */
  subtle?: boolean;
  /** Maximum width */
  maxWidth?: string | number;
  /** Custom class name */
  className?: string;
}

/**
 * Lozenge component following Atlassian Design System principles
 * - Status indicators and labels
 * - Subtle and bold variants
 * - Accessible with proper color contrast
 */
export const Lozenge: React.FC<LozengeProps> = ({
  children,
  type = 'default',
  size = 'medium',
  subtle = false,
  maxWidth,
  className = ''
}) => {
  const lozengeClass = [
    'atlas-lozenge',
    `atlas-lozenge--${type}`,
    `atlas-lozenge--${size}`,
    subtle && 'atlas-lozenge--subtle',
    className
  ].filter(Boolean).join(' ');

  const style: React.CSSProperties = {};
  if (maxWidth) {
    style.maxWidth = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
  }

  return (
    <span className={lozengeClass} style={style}>
      {children}
    </span>
  );
};

export default Lozenge;
