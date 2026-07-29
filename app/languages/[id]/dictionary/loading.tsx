/** Skeleton shown while the dictionary page fetches its entries. */
export default function DictionaryLoading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-8 w-32 bg-accent rounded mb-6" />
      <div className="flex flex-wrap gap-3">
        <div className="h-10 flex-1 bg-accent rounded" />
        <div className="h-10 flex-4 bg-accent rounded" />
        <div className="h-10 flex-1 bg-accent rounded" />
      </div>
      <div className="h-10 bg-accent rounded" />
      <div className="flex flex-wrap gap-3">
        <div className="h-10 flex-6 bg-accent rounded" />
        <div className="h-10 flex-1 bg-accent rounded" />
        <div className="h-10 flex-1 bg-accent rounded" />
        <div className="h-10 flex-1 bg-accent rounded" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-accent rounded" />
        ))}
      </div>
    </div>
  );
}
