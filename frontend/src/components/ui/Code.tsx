import React, { useRef, useEffect } from 'react';
import '../../styles/code.css';

export type CodeVariant = 'inline' | 'block';

export interface CodeProps {
  /** Code content */
  children: string;
  /** Code language for syntax highlighting */
  language?: string;
  /** Whether the code is editable */
  editable?: boolean;
  /** Placeholder text for editable code */
  placeholder?: string;
  /** Callback when code changes (for editable mode) */
  onChange?: (value: string) => void;
  /** Whether to show copy button */
  showCopyButton?: boolean;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Maximum height for scrollable code */
  maxHeight?: string | number;
  /** Custom class name */
  className?: string;
}

/**
 * Code component following Atlassian Design System principles
 * - Syntax highlighting support
 * - Copy functionality
 * - Editable mode
 * - Line numbers
 * - Accessible keyboard navigation
 */
export const Code: React.FC<CodeProps> = ({
  children,
  language,
  editable = false,
  placeholder = 'Enter code here...',
  onChange,
  showCopyButton = false,
  showLineNumbers = false,
  maxHeight,
  className = ''
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (editable && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [children, editable]);

  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      // Could show a toast notification here
    } catch (error) {
      console.warn('Failed to copy code:', error);
    }
  };

  // Handle code change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    onChange?.(value);
  };

  const codeClass = [
    'atlas-code',
    `atlas-code--${editable ? 'editable' : 'static'}`,
    className
  ].filter(Boolean).join(' ');

  const containerStyle: React.CSSProperties = {};
  if (maxHeight) {
    containerStyle.maxHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;
    containerStyle.overflow = 'auto';
  }

  // Generate line numbers
  const lines = children.split('\n');
  const lineNumbers = showLineNumbers ? Array.from({ length: lines.length }, (_, i) => i + 1) : null;

  if (editable) {
    return (
      <div className={codeClass} style={containerStyle}>
        {showCopyButton && (
          <button
            type="button"
            className="atlas-code__copy-button"
            onClick={handleCopy}
            aria-label="Copy code"
            title="Copy code"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4 2a1 1 0 011 1v1h1a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm5 0a1 1 0 011 1v1h1a1 1 0 110 2H9a1 1 0 01-1-1V3a1 1 0 011-1zM4 7a1 1 0 011 1v1h1a1 1 0 110 2H4a1 1 0 01-1-1V8a1 1 0 011-1zm5 0a1 1 0 011 1v1h1a1 1 0 110 2H9a1 1 0 01-1-1V8a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}

        <div className="atlas-code__container">
          {showLineNumbers && lineNumbers && (
            <div className="atlas-code__line-numbers" aria-hidden="true">
              {lineNumbers.map(num => (
                <span key={num} className="atlas-code__line-number">
                  {num}
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="atlas-code__textarea"
            value={children}
            placeholder={placeholder}
            onChange={handleChange}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-language={language}
            aria-label={language ? `${language} code editor` : 'Code editor'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={codeClass} style={containerStyle}>
      {showCopyButton && (
        <button
          type="button"
          className="atlas-code__copy-button"
          onClick={handleCopy}
          aria-label="Copy code"
          title="Copy code"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4 2a1 1 0 011 1v1h1a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm5 0a1 1 0 011 1v1h1a1 1 0 110 2H9a1 1 0 01-1-1V3a1 1 0 011-1zM4 7a1 1 0 011 1v1h1a1 1 0 110 2H4a1 1 0 01-1-1V8a1 1 0 011-1zm5 0a1 1 0 011 1v1h1a1 1 0 110 2H9a1 1 0 01-1-1V8a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      <div className="atlas-code__container">
        {showLineNumbers && lineNumbers && (
          <div className="atlas-code__line-numbers" aria-hidden="true">
            {lineNumbers.map(num => (
              <span key={num} className="atlas-code__line-number">
                {num}
              </span>
            ))}
          </div>
        )}

        <pre ref={preRef} className="atlas-code__pre" data-language={language}>
          <code className="atlas-code__code">
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
};

/**
 * Inline Code component for inline code snippets
 */
export const InlineCode: React.FC<Omit<CodeProps, 'variant' | 'showLineNumbers' | 'maxHeight'>> = (props) => {
  return <code className="atlas-inline-code" {...props}>{props.children}</code>;
};

export default Code;
