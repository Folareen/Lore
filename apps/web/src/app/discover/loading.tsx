export default function Loading() {
  return (
    <main id="main-content" className="discover-page" aria-busy="true">
      <p role="status">Finding communities…</p>
      <div className="discover-grid" aria-hidden="true">
        {[1, 2, 3].map((id) => (
          <div className="discover-card" key={id}>
            <div className="skeleton short" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ))}
      </div>
    </main>
  );
}
