// Linked task cell (QA-08, QA-09): the task an issue was filed against.
import { useOpenTask } from './api';

/** Opens a linked task in the drawer instead of following the row click. */
export function LinkedTask({ id }: { id: number | null | undefined }) {
  const [, openTask] = useOpenTask();
  if (!id) return <span className="text-text-muted">Independent</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void openTask(id);
      }}
      className="font-bold text-primary hover:underline"
    >
      {id}
    </button>
  );
}
