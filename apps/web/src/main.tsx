import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { queryClient } from './api/queries';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        <App />
        <Toaster
          position="bottom-right"
          visibleToasts={4}
          toastOptions={{
            className: '!font-body !text-body !border-border',
            style: { borderLeft: '4px solid var(--accent)' },
          }}
        />
      </NuqsAdapter>
    </QueryClientProvider>
  </StrictMode>,
);
