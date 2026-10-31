export default function Loading() {
  return (
    <div
      className="loading-state"
      role="status"
      aria-label="Loading your community"
    >
      <span className="sr-only">Loading your community…</span>
      <div className="skeleton short" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
