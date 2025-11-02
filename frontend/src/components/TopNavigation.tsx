import type { FC, ReactNode } from 'react';

interface NavigationTab {
  id: string;
  label: string;
  badge?: string;
}

interface TopNavigationProps {
  productName: string;
  productSubtitle?: string;
  tabs: NavigationTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  priceSummary?: {
    symbol: string;
    price?: number | null;
  };
  liveStatus: 'connected' | 'disconnected';
  loading?: boolean;
  actions?: ReactNode;
}

export const TopNavigation: FC<TopNavigationProps> = ({
  productName,
  productSubtitle,
  tabs,
  activeTab,
  onTabChange,
  priceSummary,
  liveStatus,
  loading = false,
  actions
}) => {
  const statusLabel = liveStatus === 'connected' ? 'Live' : 'Offline';
  const statusTone = liveStatus === 'connected' ? 'status-pill--success' : 'status-pill--error';

  return (
    <div className="top-bar" role="navigation" aria-label="Primary">
      <div className="top-bar__row">
        <div className="top-bar__brand" aria-label={productName}>
          <div className="product-badge" aria-hidden="true">S</div>
          <div className="product-meta">
            <span className="product-name">{productName}</span>
            {productSubtitle && <span className="product-subtitle">{productSubtitle}</span>}
          </div>
        </div>

        {priceSummary && (
          <div className="top-bar__price" aria-live="polite">
            <span className="price-label">{priceSummary.symbol}</span>
            <span className="price-value">
              {priceSummary.price && priceSummary.price > 0
                ? `$${priceSummary.price.toLocaleString()}`
                : '—'}
            </span>
          </div>
        )}

        <div className="top-bar__status">
          <span className={`status-pill ${statusTone}`}>
            <span className="status-indicator" aria-hidden="true" />
            {statusLabel}
          </span>
        </div>

        {actions && <div className="top-bar__actions">{actions}</div>}
      </div>

      <div className="top-bar__nav" role="tablist" aria-label="Application sections">
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab ${isActive ? 'nav-tab--active' : ''}`}
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              disabled={loading}
            >
              <span className="nav-tab__label">{tab.label}</span>
              {tab.badge && <span className="nav-tab__badge">{tab.badge}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
