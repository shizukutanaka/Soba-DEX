/**
 * Offline and PWA Service for DEX Mobile Application
 *
 * Advanced offline functionality with:
 * - Network status monitoring
 * - Offline transaction queuing
 * - Background synchronization
 * - PWA installation management
 * - Cache management and optimization
 * - Offline-first architecture support
 *
 * @version 1.0.0
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';

class OfflineService {
  constructor() {
    this.initialized = false;
    this.isOnline = true;
    this.isPWAInstalled = false;
    this.offlineQueue = [];
    this.syncInProgress = false;
    this.listeners = new Set();

    // Configuration
    this.config = {
      maxQueueSize: 1000,
      syncInterval: 30000, // 30 seconds
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      enableBackgroundSync: true,
      enableOfflineQueue: true,
      enablePWAManagement: true
    };

    // Storage keys
    this.STORAGE_KEYS = {
      OFFLINE_QUEUE: '@dex_offline_queue',
      PWA_INSTALLED: '@dex_pwa_installed',
      LAST_SYNC: '@dex_last_sync',
      CACHE_VERSION: '@dex_cache_version'
    };

    this.initializeService();
  }

  /**
   * Initialize the offline service
   */
  async initializeService() {
    try {
      console.log('🚀 Initializing Offline Service...');

      // Setup network monitoring
      await this.setupNetworkMonitoring();

      // Load offline queue
      await this.loadOfflineQueue();

      // Setup PWA management
      if (this.config.enablePWAManagement) {
        await this.setupPWAManagement();
      }

      // Setup background sync
      if (this.config.enableBackgroundSync) {
        this.setupBackgroundSync();
      }

      // Register service worker for web
      if (Platform.OS === 'web') {
        await this.registerServiceWorker();
      }

      this.initialized = true;
      console.log('✅ Offline Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Offline Service:', error);
      throw error;
    }
  }

  /**
   * Setup network monitoring
   */
  async setupNetworkMonitoring() {
    try {
      // Get initial network state
      const netInfo = await NetInfo.fetch();
      this.isOnline = netInfo.isConnected && netInfo.isInternetReachable;

      // Listen for network state changes
      this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
        const wasOnline = this.isOnline;
        this.isOnline = state.isConnected && state.isInternetReachable;

        if (wasOnline && !this.isOnline) {
          this.handleGoingOffline();
        } else if (!wasOnline && this.isOnline) {
          this.handleComingOnline();
        }

        // Notify listeners
        this.notifyListeners('networkChange', {
          isOnline: this.isOnline,
          connectionType: state.type,
          isInternetReachable: state.isInternetReachable
        });
      });

      console.log('📡 Network monitoring setup complete');
    } catch (error) {
      console.error('Error setting up network monitoring:', error);
    }
  }

  /**
   * Setup PWA management
   */
  async setupPWAManagement() {
    try {
      if (Platform.OS === 'web') {
        // Check if PWA is installed
        this.isPWAInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                             window.navigator.standalone === true;

        // Listen for PWA install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault();
          this.deferredPrompt = e;
          this.notifyListeners('installPrompt', { available: true });
        });

        // Listen for PWA installation
        window.addEventListener('appinstalled', () => {
          this.isPWAInstalled = true;
          this.savePWAStatus(true);
          this.notifyListeners('pwaInstalled', { installed: true });
        });
      }

      // Load PWA status from storage
      const pwaInstalled = await AsyncStorage.getItem(this.STORAGE_KEYS.PWA_INSTALLED);
      if (pwaInstalled === 'true') {
        this.isPWAInstalled = true;
      }

      console.log('📱 PWA management setup complete');
    } catch (error) {
      console.error('Error setting up PWA management:', error);
    }
  }

  /**
   * Register service worker for web
   */
  async registerServiceWorker() {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/sw.js');

        console.log('🔧 Service Worker registered:', registration.scope);

        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this.notifyListeners('serviceWorkerUpdate', { updateAvailable: true });
              }
            });
          }
        });

        // Handle service worker messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          this.handleServiceWorkerMessage(event.data);
        });
      }
    } catch (error) {
      console.error('Error registering service worker:', error);
    }
  }

  /**
   * Setup background synchronization
   */
  setupBackgroundSync() {
    // Sync offline queue periodically when online
    setInterval(() => {
      if (this.isOnline && this.offlineQueue.length > 0 && !this.syncInProgress) {
        this.syncOfflineQueue();
      }
    }, this.config.syncInterval);

    console.log('🔄 Background sync setup complete');
  }

  /**
   * Handle going offline
   */
  handleGoingOffline() {
    console.log('📴 Going offline - enabling offline mode');

    this.notifyListeners('goingOffline', {
      timestamp: new Date().toISOString(),
      queueSize: this.offlineQueue.length
    });
  }

  /**
   * Handle coming back online
   */
  handleComingOnline() {
    console.log('📶 Coming back online - starting sync');

    this.notifyListeners('comingOnline', {
      timestamp: new Date().toISOString(),
      queueSize: this.offlineQueue.length
    });

    // Start syncing offline queue
    if (this.offlineQueue.length > 0) {
      this.syncOfflineQueue();
    }
  }

  /**
   * Add transaction to offline queue
   */
  async addToOfflineQueue(transaction) {
    try {
      if (!this.config.enableOfflineQueue) {
        throw new Error('Offline queue is disabled');
      }

      if (this.offlineQueue.length >= this.config.maxQueueSize) {
        // Remove oldest transaction if queue is full
        this.offlineQueue.shift();
        console.warn('🔄 Offline queue full, removing oldest transaction');
      }

      const queuedTransaction = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalTransaction: transaction,
        timestamp: Date.now(),
        retryCount: 0,
        status: 'pending'
      };

      this.offlineQueue.push(queuedTransaction);
      await this.saveOfflineQueue();

      this.notifyListeners('transactionQueued', {
        transactionId: queuedTransaction.id,
        queueSize: this.offlineQueue.length
      });

      console.log('📝 Transaction added to offline queue:', queuedTransaction.id);
      return queuedTransaction.id;

    } catch (error) {
      console.error('Error adding transaction to offline queue:', error);
      throw error;
    }
  }

  /**
   * Sync offline queue with server
   */
  async syncOfflineQueue() {
    if (this.syncInProgress || this.offlineQueue.length === 0 || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Starting offline queue sync...');

    try {
      const pendingTransactions = this.offlineQueue.filter(t => t.status === 'pending');

      for (const transaction of pendingTransactions) {
        try {
          await this.syncTransaction(transaction);

          // Remove from queue if successful
          this.offlineQueue = this.offlineQueue.filter(t => t.id !== transaction.id);
          await this.saveOfflineQueue();

          this.notifyListeners('transactionSynced', {
            transactionId: transaction.id,
            originalTransaction: transaction.originalTransaction
          });

        } catch (error) {
          console.error(`Failed to sync transaction ${transaction.id}:`, error);

          transaction.retryCount++;

          if (transaction.retryCount >= this.config.maxRetries) {
            transaction.status = 'failed';
            console.error(`Transaction ${transaction.id} failed after ${this.config.maxRetries} retries`);
          }
        }
      }

      await this.saveOfflineQueue();
      console.log('✅ Offline queue sync completed');

    } catch (error) {
      console.error('Error during offline queue sync:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync individual transaction
   */
  async syncTransaction(transaction) {
    const endpoint = this.getTransactionEndpoint(transaction.originalTransaction);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transaction.originalTransaction)
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * Get transaction endpoint based on transaction type
   */
  getTransactionEndpoint(transaction) {
    // Determine endpoint based on transaction type
    if (transaction.type === 'trade' || transaction.type === 'swap') {
      return '/api/trading/sync';
    } else if (transaction.type === 'portfolio') {
      return '/api/portfolio/sync';
    } else if (transaction.type === 'alert') {
      return '/api/alerts/sync';
    }

    return '/api/transactions/sync';
  }

  /**
   * Install PWA
   */
  async installPWA() {
    try {
      if (Platform.OS !== 'web') {
        throw new Error('PWA installation only available on web');
      }

      if (!this.deferredPrompt) {
        throw new Error('PWA installation not available');
      }

      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        this.isPWAInstalled = true;
        await this.savePWAStatus(true);
        this.notifyListeners('pwaInstalled', { installed: true });
        console.log('📱 PWA installed successfully');
      }

      this.deferredPrompt = null;
      return outcome === 'accepted';

    } catch (error) {
      console.error('Error installing PWA:', error);
      throw error;
    }
  }

  /**
   * Save offline queue to storage
   */
  async saveOfflineQueue() {
    try {
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.OFFLINE_QUEUE,
        JSON.stringify(this.offlineQueue)
      );
    } catch (error) {
      console.error('Error saving offline queue:', error);
    }
  }

  /**
   * Load offline queue from storage
   */
  async loadOfflineQueue() {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEYS.OFFLINE_QUEUE);
      if (stored) {
        this.offlineQueue = JSON.parse(stored);
        console.log(`📋 Loaded ${this.offlineQueue.length} offline transactions`);
      }
    } catch (error) {
      console.error('Error loading offline queue:', error);
      this.offlineQueue = [];
    }
  }

  /**
   * Save PWA installation status
   */
  async savePWAStatus(installed) {
    try {
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.PWA_INSTALLED,
        installed ? 'true' : 'false'
      );
    } catch (error) {
      console.error('Error saving PWA status:', error);
    }
  }

  /**
   * Handle service worker messages
   */
  handleServiceWorkerMessage(data) {
    switch (data.type) {
      case 'CACHE_STATUS':
        this.notifyListeners('cacheStatus', data.data);
        break;
      case 'CACHE_CLEARED':
        this.notifyListeners('cacheCleared', data.data);
        break;
      default:
        console.log('Unknown service worker message:', data);
    }
  }

  /**
   * Add event listener
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Remove event listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in offline service listener:', error);
      }
    });
  }

  /**
   * Get offline service status
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      isPWAInstalled: this.isPWAInstalled,
      offlineQueueSize: this.offlineQueue.length,
      syncInProgress: this.syncInProgress,
      initialized: this.initialized,
      lastSync: this.getLastSyncTime()
    };
  }

  /**
   * Get offline queue
   */
  getOfflineQueue() {
    return [...this.offlineQueue];
  }

  /**
   * Clear offline queue
   */
  async clearOfflineQueue() {
    this.offlineQueue = [];
    await this.saveOfflineQueue();
    this.notifyListeners('queueCleared', { queueSize: 0 });
    console.log('🗑️ Offline queue cleared');
  }

  /**
   * Force sync offline queue
   */
  async forceSync() {
    if (!this.isOnline) {
      throw new Error('Cannot sync while offline');
    }

    await this.syncOfflineQueue();
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime() {
    try {
      const lastSync = await AsyncStorage.getItem(this.STORAGE_KEYS.LAST_SYNC);
      return lastSync ? new Date(parseInt(lastSync)) : null;
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  }

  /**
   * Update last sync time
   */
  async updateLastSyncTime() {
    try {
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.LAST_SYNC,
        Date.now().toString()
      );
    } catch (error) {
      console.error('Error updating last sync time:', error);
    }
  }

  /**
   * Check if PWA can be installed
   */
  canInstallPWA() {
    return Platform.OS === 'web' && this.deferredPrompt && !this.isPWAInstalled;
  }

  /**
   * Get cache status from service worker
   */
  async getCacheStatus() {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;

      // Send message to service worker
      const messageChannel = new MessageChannel();

      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };

        registration.active?.postMessage(
          { type: 'GET_CACHE_STATUS' },
          [messageChannel.port2]
        );

        // Timeout after 5 seconds
        setTimeout(() => resolve(null), 5000);
      });
    }

    return null;
  }

  /**
   * Clear all caches
   */
  async clearAllCaches() {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;

      // Send message to service worker
      const messageChannel = new MessageChannel();

      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };

        registration.active?.postMessage(
          { type: 'CLEAR_CACHE' },
          [messageChannel.port2]
        );

        // Timeout after 5 seconds
        setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
      });
    }

    return { success: false, error: 'Not available on this platform' };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
    }

    this.listeners.clear();
    console.log('🧹 Offline service cleaned up');
  }
}

// Create singleton instance
const offlineService = new OfflineService();

export default offlineService;
export { OfflineService };
