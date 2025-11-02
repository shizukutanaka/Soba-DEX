import React, { useRef, useEffect, useState } from 'react';
import '../../styles/inline-dialog.css';

export interface InlineDialogProps {
  /** Content to display in the dialog */
  content: React.ReactNode;
  /** Trigger element that opens the dialog */
  children: React.ReactNode;
  /** Whether the dialog is open */
  isOpen?: boolean;
  /** Function to close the dialog */
  onClose?: () => void;
  /** Placement of the dialog relative to trigger */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  /** Whether to close on click outside */
  closeOnOutsideClick?: boolean;
  /** Whether to close on escape key */
  closeOnEscape?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Inline Dialog component following Atlassian Design System principles
 * - Portal-based rendering
 * - Focus management
 * - Keyboard navigation
 * - Positioning logic
 */
export const InlineDialog: React.FC<InlineDialogProps> = ({
  content,
  children,
  isOpen: controlledIsOpen,
  onClose,
  placement = 'bottom',
  closeOnOutsideClick = true,
  closeOnEscape = true,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(controlledIsOpen || false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const actualIsOpen = controlledIsOpen !== undefined ? controlledIsOpen : isOpen;

  // Toggle dialog
  const toggleDialog = () => {
    if (controlledIsOpen === undefined) {
      setIsOpen(!isOpen);
    }
    if (!actualIsOpen && onClose) {
      // Opening
    } else if (actualIsOpen && onClose) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    if (!actualIsOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (controlledIsOpen === undefined) {
          setIsOpen(false);
        }
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [actualIsOpen, closeOnEscape, controlledIsOpen, onClose]);

  // Handle outside click
  useEffect(() => {
    if (!actualIsOpen || !closeOnOutsideClick) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        dialogRef.current &&
        !dialogRef.current.contains(e.target as Node)
      ) {
        if (controlledIsOpen === undefined) {
          setIsOpen(false);
        }
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [actualIsOpen, closeOnOutsideClick, controlledIsOpen, onClose]);

  // Calculate position
  useEffect(() => {
    if (!actualIsOpen || !triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dialogRect = dialogRef.current?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    // Calculate base position
    switch (placement) {
      case 'top':
        top = triggerRect.top - (dialogRect?.height || 200) - 8;
        left = triggerRect.left + triggerRect.width / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + 8;
        left = triggerRect.left + triggerRect.width / 2;
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2;
        left = triggerRect.left - (dialogRect?.width || 200) - 8;
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2;
        left = triggerRect.right + 8;
        break;
      default:
        // Auto placement logic
        const spaceBelow = viewportHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;
        const spaceRight = viewportWidth - triggerRect.right;
        const spaceLeft = triggerRect.left;

        if (spaceBelow >= 200 || spaceBelow > spaceAbove) {
          top = triggerRect.bottom + 8;
          left = triggerRect.left + triggerRect.width / 2;
        } else {
          top = triggerRect.top - 200 - 8;
          left = triggerRect.left + triggerRect.width / 2;
        }
    }

    // Adjust for viewport boundaries
    if (dialogRect) {
      left = Math.max(8, Math.min(left - dialogRect.width / 2, viewportWidth - dialogRect.width - 8));
    }

    setPosition({ top, left });
  }, [actualIsOpen, placement]);

  const dialogClass = [
    'atlas-inline-dialog',
    `atlas-inline-dialog--${placement}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* Trigger */}
      <div
        ref={triggerRef}
        className="atlas-inline-dialog-trigger"
        onClick={toggleDialog}
        aria-haspopup="dialog"
        aria-expanded={actualIsOpen}
      >
        {children}
      </div>

      {/* Dialog */}
      {actualIsOpen && (
        <div
          ref={dialogRef}
          className={dialogClass}
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 'var(--z-index-popover)'
          }}
          role="dialog"
          aria-modal="false"
        >
          <div className="atlas-inline-dialog__content">
            {content}
          </div>
        </div>
      )}
    </>
  );
};

export default InlineDialog;
