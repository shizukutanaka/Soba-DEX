/**
 * PWA Installer Utility
 * Handles Progressive Web App installation prompts and registration
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class PWAInstaller {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isInstalled = false;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.init();
  }

  /**
   * Initialize PWA installer
   */
  private init() {
    // Check if already installed
    this.checkInstallStatus();

    // Listen for install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.notifyInstallAvailable();
    });

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.deferredPrompt = null;
      this.notifyInstalled();
    });

    // Register service worker
    this.registerServiceWorker();
  }

  /**
   * Check if app is already installed
   */
  private checkInstallStatus() {
    // Check if running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true;
      return;
    }

    // Check navigator.standalone (iOS)
    if ((navigator as any).standalone) {
      this.isInstalled = true;
      return;
    }

    // Check if installed (Chrome/Edge)
    if (document.referrer.includes('android-app://')) {
      this.isInstalled = true;
      return;
    }
  }

  /**
   * Register service worker
   */
  private async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register(
          '/service-worker.js',
          { scope: '/' }
        );

        this.serviceWorkerRegistration = registration;

        console.log('[PWA] Service Worker registered:', registration.scope);

        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60000); // Check every minute

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                // New service worker available
                this.notifyUpdateAvailable();
              }
            });
          }
        });

        // Listen for controller change
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // Reload page to use new service worker
          window.location.reload();
        });
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    }
  }

  /**
   * Show install prompt
   */
  async showInstallPrompt(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.log('[PWA] Install prompt not available');
      return false;
    }

    try {
      // Show the install prompt
      await this.deferredPrompt.prompt();

      // Wait for the user's response
      const { outcome } = await this.deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
        this.deferredPrompt = null;
        return true;
      } else {
        console.log('[PWA] User dismissed install prompt');
        return false;
      }
    } catch (error) {
      console.error('[PWA] Install prompt error:', error);
      return false;
    }
  }

  /**
   * Check if install prompt is available
   */
  canInstall(): boolean {
    return !this.isInstalled && this.deferredPrompt !== null;
  }

  /**
   * Check if app is installed
   */
  isAppInstalled(): boolean {
    return this.isInstalled;
  }

  /**
   * Activate service worker update
   */
  activateUpdate() {
    if (this.serviceWorkerRegistration?.waiting) {
      this.serviceWorkerRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.log('[PWA] Notifications not supported');
      return 'denied';
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission;
    }

    return Notification.permission;
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToPush(): Promise<PushSubscription | null> {
    if (!this.serviceWorkerRegistration) {
      console.error('[PWA] Service Worker not registered');
      return null;
    }

    const permission = await this.requestNotificationPermission();
    if (permission !== 'granted') {
      console.log('[PWA] Notification permission denied');
      return null;
    }

    try {
      // Subscribe to push notifications
      const subscription = await this.serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          process.env.REACT_APP_VAPID_PUBLIC_KEY || ''
        ) as BufferSource
      });

      console.log('[PWA] Push subscription created');
      return subscription;
    } catch (error) {
      console.error('[PWA] Push subscription failed:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeFromPush(): Promise<boolean> {
    if (!this.serviceWorkerRegistration) {
      return false;
    }

    try {
      const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        console.log('[PWA] Push subscription removed');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[PWA] Unsubscribe failed:', error);
      return false;
    }
  }

  /**
   * Show notification
   */
  async showNotification(title: string, options?: NotificationOptions) {
    if (!this.serviceWorkerRegistration) {
      console.error('[PWA] Service Worker not registered');
      return;
    }

    const permission = await this.requestNotificationPermission();
    if (permission !== 'granted') {
      console.log('[PWA] Notification permission denied');
      return;
    }

    try {
      await this.serviceWorkerRegistration.showNotification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...(options as any)
      });
    } catch (error) {
      console.error('[PWA] Show notification failed:', error);
    }
  }

  /**
   * Add to home screen (iOS)
   */
  showIOSInstallPrompt() {
    // iOS doesn't support install prompt, show instructions instead
    return {
      isIOS: this.isIOS(),
      instructions: [
        '1. Tap the Share button',
        '2. Scroll down and tap "Add to Home Screen"',
        '3. Tap "Add" to install Soba DEX'
      ]
    };
  }

  /**
   * Check if device is iOS
   */
  private isIOS(): boolean {
    return /iPhone|iPad|iPod/.test(navigator.userAgent);
  }

  /**
   * Notify listeners that install is available
   */
  private notifyInstallAvailable() {
    const event = new CustomEvent('pwa-install-available');
    window.dispatchEvent(event);
  }

  /**
   * Notify listeners that app is installed
   */
  private notifyInstalled() {
    const event = new CustomEvent('pwa-installed');
    window.dispatchEvent(event);
  }

  /**
   * Notify listeners that update is available
   */
  private notifyUpdateAvailable() {
    const event = new CustomEvent('pwa-update-available');
    window.dispatchEvent(event);
  }

  /**
   * Convert VAPID key
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  /**
   * Clear all caches
   */
  async clearCache() {
    if (this.serviceWorkerRegistration) {
      this.serviceWorkerRegistration.active?.postMessage({ type: 'CLEAR_CACHE' });
    }
  }

  /**
   * Get install stats
   */
  getStats() {
    return {
      isInstalled: this.isInstalled,
      canInstall: this.canInstall(),
      isIOS: this.isIOS(),
      serviceWorkerRegistered: !!this.serviceWorkerRegistration,
      notificationPermission: 'Notification' in window ? Notification.permission : 'not-supported'
    };
  }
}

// Export singleton instance
export const pwaInstaller = new PWAInstaller();

export default pwaInstaller;
