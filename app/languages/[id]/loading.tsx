/** Skeleton shown while the language overview page fetches its stats. */
export default function LanguageOverviewLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 bg-accent rounded" />
        <div className="h-4 w-40 bg-accent rounded" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border bg-card" />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="h-6 w-48 bg-accent rounded" />
        <div className="rounded-lg border bg-card divide-y">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-11 p-3">
              <div className="h-4 w-32 bg-accent rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
