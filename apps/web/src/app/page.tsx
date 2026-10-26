export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-8 py-20">
      <p className="mb-8 text-sm font-semibold uppercase tracking-[0.35em] text-lime-300">
        Lore / Project foundation
      </p>
      <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight sm:text-7xl">
        Every stream has a story. Lore remembers it.
      </h1>
      <p className="mt-8 max-w-xl text-lg leading-relaxed text-stone-400">
        Shared memory for Twitch communities. Promises, decisions, and community
        stories that carry into the next stream.
      </p>
      <div className="mt-14 grid gap-4 border-t border-stone-700 pt-8 sm:grid-cols-3">
        {['Streamer Home', 'Moderator Desk', 'Community Lore'].map(
          (surface) => (
            <div key={surface}>
              <h2 className="font-medium">{surface}</h2>
              <p className="mt-2 text-sm text-stone-500">
                Planned product surface
              </p>
            </div>
          ),
        )}
      </div>
      <a
        className="mt-12 w-fit text-sm text-lime-300 underline underline-offset-4"
        href="/api/health"
      >
        Check local API health
      </a>
    </main>
  );
}
