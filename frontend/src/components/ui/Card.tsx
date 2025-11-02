import React from 'react';
import '../../styles/card.css';

export interface CardProps {
  /** Card content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive';
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Whether the card is clickable */
  onClick?: () => void;
  /** Whether the card is hoverable */
  hoverable?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Card component for containing content
 * Following Atlassian Design System principles
 */
export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  onClick,
  hoverable = false,
  className = ''
}) => {
  const baseClass = 'atlas-card';
  const variantClass = `atlas-card--${variant}`;
  const paddingClass = `atlas-card--padding-${padding}`;
  const clickableClass = onClick ? 'atlas-card--clickable' : '';
  const hoverableClass = hoverable ? 'atlas-card--hoverable' : '';

  const classNames = [
    baseClass,
    variantClass,
    paddingClass,
    clickableClass,
    hoverableClass,
    className
  ].filter(Boolean).join(' ');

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={classNames}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Component>
  );
};

/**
 * Card Header component
 */
export const CardHeader: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`atlas-card__header ${className}`}>
    {children}
  </div>
);

/**
 * Card Body component
 */
export const CardBody: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`atlas-card__body ${className}`}>
    {children}
  </div>
);

/**
 * Card Footer component
 */
export const CardFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`atlas-card__footer ${className}`}>
    {children}
  </div>
);

/**
 * Card Title component
 */
export const CardTitle: React.FC<{
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  className?: string;
}> = ({ children, as: Component = 'h3', className = '' }) => (
  <Component className={`atlas-card__title ${className}`}>
    {children}
  </Component>
);

/**
 * Card Description component
 */
export const CardDescription: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <p className={`atlas-card__description ${className}`}>
    {children}
  </p>
);

export default Card;
