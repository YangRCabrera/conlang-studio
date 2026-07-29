/** Skeleton shown while the wordgen page fetches syllable structures. */
export default function WordgenLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-32 bg-accent rounded mb-6" />
      <div className="w-full h-full flex flex-row gap-4">
        <div className="flex-1 p-4 flex flex-col gap-2 items-center">
          <div className="flex flex-row items-center gap-2">
            <div className="h-6 w-32 bg-accent rounded mb-1" />
            <div className="h-10 w-20 bg-accent rounded" />
          </div>
          <div className="flex flex-row items-center gap-2">
            <div className="h-6 w-32 bg-accent rounded mt-3 mb-1" />
            <div className="h-10 w-20 bg-accent rounded" />
          </div>
          <div className="h-12 w-40 bg-accent rounded m-2" />
        </div>
        <div className="flex-2 py-4 px-16 rounded flex flex-col justify-center items-start gap-2 bg-accent"></div>
      </div>
    </div>
  );
}
