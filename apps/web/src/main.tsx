import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tooltip from '@radix-ui/react-tooltip';
import { queryClient } from './api/queries';
import App from './App';
import './index.css';
// Applies the saved theme before the first paint (no flash of the wrong colours).
import './store/theme';
import { ThemedToaster } from './components/ThemedToaster';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <Tooltip.Provider delayDuration={150}>
          <App />
        </Tooltip.Provider>
        <ThemedToaster />
      </NuqsAdapter>
    </QueryClientProvider>
  </StrictMode>,
);
