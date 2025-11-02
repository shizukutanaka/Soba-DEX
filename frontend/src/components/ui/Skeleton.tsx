import React from 'react';
import '../../styles/skeleton.css';

export interface SkeletonProps {
  /** Width of the skeleton */
  width?: string | number;
  /** Height of the skeleton */
  height?: string | number;
  /** Shape variant */
  variant?: 'text' | 'circle' | 'rect';
  /** Animation type */
  animation?: 'pulse' | 'wave' | 'none';
  /** Number of lines for text variant */
  lines?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Skeleton component for loading states
 * Following Atlassian Design System principles for progressive loading
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = 'text',
  animation = 'pulse',
  lines = 1,
  className = ''
}) => {
  const baseClass = 'atlas-skeleton';
  const variantClass = `atlas-skeleton--${variant}`;
  const animationClass = animation !== 'none' ? `atlas-skeleton--${animation}` : '';

  const classNames = [baseClass, variantClass, animationClass, className]
    .filter(Boolean)
    .join(' ');

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className="atlas-skeleton-group" role="status" aria-label="Loading content">
        {Array.from({ length: lines }).map((_, index) => {
          const isLastLine = index === lines - 1;
          const lineWidth = isLastLine ? '70%' : '100%';
          return (
            <div
              key={index}
              className={classNames}
              style={{ ...style, width: style.width || lineWidth }}
              aria-hidden="true"
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={classNames}
      style={style}
      role="status"
      aria-label="Loading content"
      aria-live="polite"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

/**
 * Skeleton card component for complex loading states
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`atlas-skeleton-card ${className}`} role="status" aria-label="Loading card">
      <div className="atlas-skeleton-card__header">
        <Skeleton variant="circle" width={48} height={48} />
        <div className="atlas-skeleton-card__header-text">
          <Skeleton variant="text" width="60%" height={16} />
          <Skeleton variant="text" width="40%" height={12} />
        </div>
      </div>
      <div className="atlas-skeleton-card__body">
        <Skeleton variant="text" lines={3} />
      </div>
      <div className="atlas-skeleton-card__footer">
        <Skeleton variant="rect" width={80} height={32} />
        <Skeleton variant="rect" width={80} height={32} />
      </div>
    </div>
  );
};

/**
 * Skeleton table component for data loading states
 */
export const SkeletonTable: React.FC<{ rows?: number; columns?: number; className?: string }> = ({
  rows = 5,
  columns = 4,
  className = ''
}) => {
  return (
    <div className={`atlas-skeleton-table ${className}`} role="status" aria-label="Loading table">
      <div className="atlas-skeleton-table__header">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} variant="text" width="80%" height={14} />
        ))}
      </div>
      <div className="atlas-skeleton-table__body">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="atlas-skeleton-table__row">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={colIndex} variant="text" width="90%" height={12} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Skeleton;
