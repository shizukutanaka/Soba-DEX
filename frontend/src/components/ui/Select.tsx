import React, { useState, useRef, useEffect } from 'react';
import '../../styles/select.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SelectProps {
  /** Available options */
  options: SelectOption[];
  /** Selected value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Whether field is required */
  isRequired?: boolean;
  /** Whether select is disabled */
  disabled?: boolean;
  /** Whether select is searchable */
  searchable?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Select component for choosing from options
 * Following Atlassian Design System principles
 */
export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  helperText,
  error,
  isRequired = false,
  disabled = false,
  searchable = false,
  fullWidth = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const selectRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  const filteredOptions = searchable
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        if (!isOpen) {
          e.preventDefault();
          setIsOpen(true);
        } else if (filteredOptions[highlightedIndex]) {
          e.preventDefault();
          handleSelect(filteredOptions[highlightedIndex].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev =>
            prev < filteredOptions.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(0);
  };

  const containerClass = [
    'atlas-select-container',
    fullWidth && 'atlas-select-container--full',
    className
  ].filter(Boolean).join(' ');

  const triggerClass = [
    'atlas-select__trigger',
    isOpen && 'atlas-select__trigger--open',
    error && 'atlas-select__trigger--error',
    disabled && 'atlas-select__trigger--disabled'
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass}>
      {label && (
        <label className="atlas-select__label">
          {label}
          {isRequired && <span className="atlas-select__required">*</span>}
        </label>
      )}

      <div ref={selectRef} className="atlas-select">
        <button
          type="button"
          className={triggerClass}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-required={isRequired}
        >
          <span className="atlas-select__value">
            {selectedOption?.icon && (
              <span className="atlas-select__icon" aria-hidden="true">
                {selectedOption.icon}
              </span>
            )}
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <svg
            className="atlas-select__chevron"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {isOpen && (
          <div className="atlas-select__dropdown" role="listbox">
            {searchable && (
              <div className="atlas-select__search">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="atlas-select__search-input"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            <div className="atlas-select__options">
              {filteredOptions.length === 0 ? (
                <div className="atlas-select__empty">No options found</div>
              ) : (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    className={[
                      'atlas-select__option',
                      option.value === value && 'atlas-select__option--selected',
                      index === highlightedIndex && 'atlas-select__option--highlighted',
                      option.disabled && 'atlas-select__option--disabled'
                    ].filter(Boolean).join(' ')}
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    disabled={option.disabled}
                    role="option"
                    aria-selected={option.value === value}
                  >
                    {option.icon && (
                      <span className="atlas-select__option-icon" aria-hidden="true">
                        {option.icon}
                      </span>
                    )}
                    <span>{option.label}</span>
                    {option.value === value && (
                      <svg
                        className="atlas-select__check"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {helperText && !error && (
        <p className="atlas-select__helper">{helperText}</p>
      )}

      {error && (
        <p className="atlas-select__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default Select;
