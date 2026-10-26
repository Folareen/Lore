export default function Loading() {
  return (
    <div
      className="loading-state"
      role="status"
      aria-label="Loading your workspace"
    >
      <span className="sr-only">Loading your workspace…</span>
      <div className="skeleton short" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
