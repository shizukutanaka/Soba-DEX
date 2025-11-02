import React from 'react';
import '../../styles/progress-tracker.css';

export interface ProgressStep {
  /** Step label */
  label: string;
  /** Step description */
  description?: string;
  /** Step status */
  status: 'incomplete' | 'current' | 'completed' | 'error';
  /** Custom icon for the step */
  icon?: React.ReactNode;
}

export interface ProgressTrackerProps {
  /** Array of progress steps */
  steps: ProgressStep[];
  /** Current active step index (0-based) */
  currentStep?: number;
  /** Orientation of the tracker */
  orientation?: 'horizontal' | 'vertical';
  /** Custom class name */
  className?: string;
}

/**
 * Progress Tracker component following Atlassian Design System principles
 * - Visual progress indication
 * - Step-by-step process guidance
 * - Accessible with proper ARIA labels
 */
export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  steps,
  currentStep = 0,
  orientation = 'horizontal',
  className = ''
}) => {
  const containerClass = [
    'atlas-progress-tracker',
    `atlas-progress-tracker--${orientation}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass} role="progressbar" aria-valuenow={currentStep + 1} aria-valuemax={steps.length}>
      <ol className="atlas-progress-tracker__list">
        {steps.map((step, index) => {
          const stepClass = [
            'atlas-progress-tracker__step',
            `atlas-progress-tracker__step--${step.status}`
          ].filter(Boolean).join(' ');

          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';
          const isError = step.status === 'error';

          // Default icons
          const defaultIcon = isCompleted ? (
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : isError ? (
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <span className="atlas-progress-tracker__step-number" aria-hidden="true">
              {index + 1}
            </span>
          );

          return (
            <li key={index} className={stepClass}>
              <div className="atlas-progress-tracker__step-marker">
                {step.icon || defaultIcon}
              </div>
              <div className="atlas-progress-tracker__step-content">
                <div className="atlas-progress-tracker__step-label">
                  {step.label}
                </div>
                {step.description && (
                  <div className="atlas-progress-tracker__step-description">
                    {step.description}
                  </div>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className="atlas-progress-tracker__step-connector"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default ProgressTracker;
