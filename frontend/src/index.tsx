import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Basic performance monitoring
if ('performance' in window) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (perfData) {
        console.log('Page Load Time:', perfData.loadEventEnd - perfData.fetchStart);
        console.log('DOM Content Loaded:', perfData.domContentLoadedEventEnd - perfData.fetchStart);
        console.log('First Paint:', performance.getEntriesByType('paint')[0]?.startTime || 'Not available');
      }
    }, 0);
  });
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
