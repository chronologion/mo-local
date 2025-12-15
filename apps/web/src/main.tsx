import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './providers/AppProvider';
import { RemoteAuthProvider } from './providers/RemoteAuthProvider';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <AppProvider>
      <RemoteAuthProvider>
        <App />
      </RemoteAuthProvider>
    </AppProvider>
  </React.StrictMode>
);
