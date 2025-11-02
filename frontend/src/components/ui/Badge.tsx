import React from 'react';
import '../../styles/badge.css';

export interface BadgeProps {
  /** Badge content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Display as pill (rounded) */
  pill?: boolean;
  /** Whether badge has border only */
  outlined?: boolean;
  /** Icon to display before text */
  iconBefore?: React.ReactNode;
  /** Icon to display after text */
  iconAfter?: React.ReactNode;
  /** Custom class name */
  className?: string;
}

/**
 * Badge component for status indicators and labels
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  pill = false,
  outlined = false,
  iconBefore,
  iconAfter,
  className = ''
}) => {
  const baseClass = 'atlas-badge';
  const variantClass = `atlas-badge--${variant}`;
  const sizeClass = `atlas-badge--${size}`;
  const pillClass = pill ? 'atlas-badge--pill' : '';
  const outlinedClass = outlined ? 'atlas-badge--outlined' : '';

  const classNames = [
    baseClass,
    variantClass,
    sizeClass,
    pillClass,
    outlinedClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames}>
      {iconBefore && (
        <span className="atlas-badge__icon atlas-badge__icon--before" aria-hidden="true">
          {iconBefore}
        </span>
      )}
      <span className="atlas-badge__text">{children}</span>
      {iconAfter && (
        <span className="atlas-badge__icon atlas-badge__icon--after" aria-hidden="true">
          {iconAfter}
        </span>
      )}
    </span>
  );
};

/**
 * Dot Badge for notification indicators
 */
export const DotBadge: React.FC<{
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  children?: React.ReactNode;
  className?: string;
}> = ({ variant = 'danger', children, className = '' }) => {
  return (
    <span className={`atlas-badge-dot atlas-badge-dot--${variant} ${className}`}>
      <span className="atlas-badge-dot__indicator" />
      {children}
    </span>
  );
};

export default Badge;
