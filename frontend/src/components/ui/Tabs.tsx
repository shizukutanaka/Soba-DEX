import React, { useState } from 'react';
import '../../styles/tabs.css';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  badge?: string | number;
}

export interface TabsProps {
  /** Tab items */
  items: TabItem[];
  /** Active tab ID */
  activeTab?: string;
  /** Change handler */
  onChange?: (tabId: string) => void;
  /** Visual variant */
  variant?: 'default' | 'enclosed' | 'pills';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether tabs fill container width */
  fullWidth?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Tabs component for navigation
 * Following Atlassian Design System principles
 */
export const Tabs: React.FC<TabsProps> = ({
  items,
  activeTab: controlledActiveTab,
  onChange,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className = ''
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState(items[0]?.id || '');
  const activeTab = controlledActiveTab ?? internalActiveTab;

  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (disabled) return;

    if (onChange) {
      onChange(tabId);
    } else {
      setInternalActiveTab(tabId);
    }
  };

  const containerClass = [
    'atlas-tabs',
    `atlas-tabs--${variant}`,
    `atlas-tabs--${size}`,
    fullWidth && 'atlas-tabs--full-width',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass} role="tablist">
      <div className="atlas-tabs__list">
        {items.map((item) => {
          const isActive = item.id === activeTab;
          const isDisabled = item.disabled;

          const tabClass = [
            'atlas-tabs__tab',
            isActive && 'atlas-tabs__tab--active',
            isDisabled && 'atlas-tabs__tab--disabled'
          ].filter(Boolean).join(' ');

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={tabClass}
              onClick={() => handleTabClick(item.id, isDisabled)}
              disabled={isDisabled}
              aria-selected={isActive}
              aria-controls={`tabpanel-${item.id}`}
              id={`tab-${item.id}`}
            >
              {item.icon && (
                <span className="atlas-tabs__icon" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span className="atlas-tabs__label">{item.label}</span>
              {item.badge && (
                <span className="atlas-tabs__badge" aria-hidden="true">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * TabPanel component for tab content
 */
export interface TabPanelProps {
  /** Tab ID this panel belongs to */
  tabId: string;
  /** Active tab ID */
  activeTab: string;
  /** Panel content */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({
  tabId,
  activeTab,
  children,
  className = ''
}) => {
  const isActive = tabId === activeTab;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      className={`atlas-tab-panel ${className}`}
    >
      {children}
    </div>
  );
};

export default Tabs;
