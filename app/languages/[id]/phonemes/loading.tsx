/** Skeleton shown while the phonemes page fetches data. */
export default function PhonemesLoading() {
  return (
    <div className="flex flex-col gap-10 animate-pulse">
      <section>
        <div className="h-8 w-36 bg-accent rounded mb-6" />
        <div className="h-7 w-32 bg-accent rounded mb-6" />
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="h-10 flex-1 bg-accent rounded" />
          <div className="h-10 flex-1 bg-accent rounded" />
          <div className="h-10 flex-4 bg-accent rounded" />
          <div className="h-10 flex-1 bg-accent rounded" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-accent rounded" />
          ))}
        </div>
      </section>
      <section>
        <div className="h-7 w-32 bg-accent rounded mb-6" />
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="h-10 flex-6 bg-accent rounded" />
          <div className="h-10 flex-1 bg-accent rounded" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-accent rounded" />
          ))}
        </div>
      </section>
    </div>
  );
}
