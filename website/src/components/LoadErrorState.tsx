// Launch audit 2026-09-05. The block a list or dashboard renders when the
// request behind it failed. Before this, about twenty portal pages fell through
// to their empty state ("No offers yet", "No placements found") on a failed or
// non-2xx response, so an outage read as an empty account. Pair with EmptyState:
// that one is for a genuine zero, this one is for "we could not find out".
export interface LoadErrorStateProps {
  /** What could not be loaded, as a sentence the reader can act on. */
  message: string;
  /** Re-run the request. Omit when there is nothing sensible to retry. */
  onRetry?: () => void;
}

export default function LoadErrorState({ message, onRetry }: LoadErrorStateProps) {
  return (
    <div role="alert" className="bg-surface border border-border rounded-sm p-6 text-center">
      <p className="text-sm text-foreground mb-3">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs font-medium border border-border rounded-sm text-foreground hover:border-accent transition-colors cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}
