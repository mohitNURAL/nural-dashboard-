// "‹ Back to …" above a task list opened from a popup (Projects at work, the Tasks in hand planner):
// puts the spotlight away and reopens the popup as it was.
import { closeSpotlight } from './spotlight/spotlight';

export function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        closeSpotlight();
        onBack();
      }}
      className="inline-flex items-center gap-1.5 rounded-control border border-primary/30 px-3 py-1.5 font-heading text-button text-primary hover:bg-primary-soft-100"
    >
      <span aria-hidden>‹</span> {label}
    </button>
  );
}
