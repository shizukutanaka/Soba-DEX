import React from 'react';
import '../../styles/empty-state.css';

export interface EmptyStateProps {
  /** Icon or illustration to display */
  icon?: React.ReactNode;
  /** Title of the empty state */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  /** Visual variant */
  variant?: 'default' | 'compact' | 'card';
  /** Custom class name */
  className?: string;
}

/**
 * EmptyState component following Atlassian Design System principles
 * - Clear visual hierarchy
 * - Actionable CTAs to guide users
 * - Flexible layouts
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  variant = 'default',
  className = ''
}) => {
  const containerClass = [
    'atlas-empty-state',
    `atlas-empty-state--${variant}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass} role="status" aria-label={title}>
      {icon && (
        <div className="atlas-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}

      <div className="atlas-empty-state__content">
        <h3 className="atlas-empty-state__title">{title}</h3>
        {description && (
          <p className="atlas-empty-state__description">{description}</p>
        )}
      </div>

      {(primaryAction || secondaryAction) && (
        <div className="atlas-empty-state__actions">
          {primaryAction && (
            <button
              type="button"
              className="atlas-empty-state__action atlas-empty-state__action--primary"
              onClick={primaryAction.onClick}
            >
              {primaryAction.icon && (
                <span className="atlas-empty-state__action-icon" aria-hidden="true">
                  {primaryAction.icon}
                </span>
              )}
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className="atlas-empty-state__action atlas-empty-state__action--secondary"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.icon && (
                <span className="atlas-empty-state__action-icon" aria-hidden="true">
                  {secondaryAction.icon}
                </span>
              )}
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Pre-configured empty states for common scenarios
 */
export const NoDataEmptyState: React.FC<{ onRefresh?: () => void }> = ({ onRefresh }) => (
  <EmptyState
    icon={
      <svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <path
          d="M32 16v16l11 6.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>
    }
    title="No data available"
    description="There's no data to display at the moment. Try refreshing or adjusting your filters."
    primaryAction={onRefresh ? { label: 'Refresh', onClick: onRefresh } : undefined}
  />
);

export const NoResultsEmptyState: React.FC<{ onClear?: () => void }> = ({ onClear }) => (
  <EmptyState
    icon={
      <svg viewBox="0 0 64 64" fill="none">
        <circle cx="26" cy="26" r="14" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <path
          d="M36 36l12 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path d="M22 26h8M26 22v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    }
    title="No results found"
    description="We couldn't find any matches for your search. Try different keywords or filters."
    primaryAction={onClear ? { label: 'Clear filters', onClick: onClear } : undefined}
  />
);

export const NoConnectionEmptyState: React.FC<{ onConnect?: () => void }> = ({ onConnect }) => (
  <EmptyState
    icon={
      <svg viewBox="0 0 64 64" fill="none">
        <rect x="16" y="24" width="32" height="24" rx="2" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <path d="M24 24v-4a8 8 0 0116 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        <circle cx="32" cy="36" r="3" fill="currentColor" opacity="0.4" />
      </svg>
    }
    title="Connect your wallet"
    description="Connect your wallet to access trading features and view your portfolio."
    primaryAction={onConnect ? { label: 'Connect wallet', onClick: onConnect } : undefined}
    variant="card"
  />
);

export default EmptyState;
