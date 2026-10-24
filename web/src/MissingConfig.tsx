export default function MissingConfig() {
  return (
    <main className="page">
      <h1 className="text-xl font-bold">Huddle</h1>
      <p className="mt-2">
        <code>NEXT_PUBLIC_SPACETIMEDB_URI</code> or <code>NEXT_PUBLIC_SPACETIMEDB_DB</code> is not set.
        Copy <code>.env.example</code> to <code>.env.local</code>, fill them in, and restart{" "}
        <code>npm run dev</code>.
      </p>
    </main>
  );
}
