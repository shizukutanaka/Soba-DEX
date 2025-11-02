import { useState, useEffect, useCallback } from 'react';

interface ConnectionStatus {
  isOnline: boolean;
  isWalletConnected: boolean;
  network?: string;
  latency?: number;
}

export const useConnectionStatus = () => {
  const [status, setStatus] = useState<ConnectionStatus>({
    isOnline: navigator.onLine,
    isWalletConnected: false
  });

  const checkWalletConnection = useCallback(async () => {
    try {
      const ethereum = window.ethereum;
      if (ethereum) {
        const accounts = await ethereum.request({ method: 'eth_accounts' });
        const isConnected = accounts.length > 0;

        let network = 'Unknown';
        if (isConnected) {
          const chainId = await ethereum.request({ method: 'eth_chainId' });
          network = getNetworkName(chainId);
        }

        setStatus(prev => ({
          ...prev,
          isWalletConnected: isConnected,
          network
        }));
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        isWalletConnected: false
      }));
    }
  }, []);

  const measureLatency = useCallback(async () => {
    const start = Date.now();
    try {
      await fetch('https://cloudflare.com/cdn-cgi/trace', {
        method: 'HEAD',
        cache: 'no-cache'
      });
      const latency = Date.now() - start;
      setStatus(prev => ({ ...prev, latency }));
    } catch {
      setStatus(prev => ({ ...prev, latency: undefined }));
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setStatus(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setStatus(prev => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check wallet connection
    checkWalletConnection();

    // Measure latency periodically
    measureLatency();
    const latencyInterval = setInterval(measureLatency, 30000);

    // Listen for wallet events
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', checkWalletConnection);
      window.ethereum.on('chainChanged', checkWalletConnection);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(latencyInterval);

      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', checkWalletConnection);
        window.ethereum.removeListener('chainChanged', checkWalletConnection);
      }
    };
  }, [checkWalletConnection, measureLatency]);

  return {
    ...status,
    refresh: checkWalletConnection
  };
};

function getNetworkName(chainId: string): string {
  const networks: Record<string, string> = {
    '0x1': 'Ethereum',
    '0x89': 'Polygon',
    '0xa4b1': 'Arbitrum',
    '0xa': 'Optimism',
    '0x38': 'BSC'
  };
  return networks[chainId] || `Chain ${chainId}`;
}