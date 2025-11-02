import React from 'react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

export const ConnectionIndicator: React.FC = () => {
  const { isOnline, isWalletConnected, network, latency } = useConnectionStatus();

  const getStatusColor = () => {
    if (!isOnline) return '#dc3545'; // Red
    if (!isWalletConnected) return '#ffc107'; // Yellow
    return '#28a745'; // Green
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (!isWalletConnected) return 'Wallet Disconnected';
    return 'Connected';
  };

  const getLatencyColor = () => {
    if (!latency) return '#6c757d';
    if (latency < 100) return '#28a745';
    if (latency < 300) return '#ffc107';
    return '#dc3545';
  };

  return (
    <div className="connection-indicator">
      <div className="connection-status">
        <div
          className="status-dot"
          style={{ backgroundColor: getStatusColor() }}
        />
        <span className="status-text">{getStatusText()}</span>
      </div>

      {network && (
        <div className="network-info">
          <span className="network-name">{network}</span>
        </div>
      )}

      {latency && (
        <div className="latency-info">
          <span
            className="latency-value"
            style={{ color: getLatencyColor() }}
          >
            {latency}ms
          </span>
        </div>
      )}
    </div>
  );
};