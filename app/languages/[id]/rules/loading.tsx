/** Skeleton shown while the rules page fetches data. */
export default function RulesLoading() {
  return (
    <section className="animate-pulse">
      <div className="h-8 w-32 bg-accent rounded mb-6" />
      <div className="h-10 w-80 bg-accent rounded mb-6" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-accent rounded" />
        ))}
      </div>
    </section>
  );
}
