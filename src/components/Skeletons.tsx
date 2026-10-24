import { Skeleton } from "./Skeleton";

export function RailSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-center gap-2.5 py-2">
          <Skeleton className="h-10 w-[72px]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-2.5 w-3/4" />
            <Skeleton className="h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-3.5 border-b border-line px-4 py-3">
        <Skeleton className="h-[116px] w-[206px]" />
        <div className="flex-1 space-y-2.5 py-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-2.5 w-2/3" />
          <Skeleton className="h-7 w-56" />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
