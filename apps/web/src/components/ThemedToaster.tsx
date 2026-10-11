// Toasts in the current theme (light or dark).
import { Toaster } from 'sonner';
import { useTheme } from '../store/theme';

export function ThemedToaster() {
  const resolved = useTheme((s) => s.resolved);
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      visibleToasts={4}
      toastOptions={{
        className: '!font-body !text-body !border-border',
        style: { borderLeft: '4px solid var(--accent)' },
      }}
    />
  );
}
