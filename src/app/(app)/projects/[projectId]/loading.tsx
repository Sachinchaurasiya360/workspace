import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-4 w-48" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="flex items-center gap-5">
            <Skeleton className="h-8 w-[180px]" />
            <Skeleton className="h-11 w-32 rounded-[11px]" />
          </div>
        </div>
      </div>
      <div className="flex h-11 items-end border-b border-border">
        <Skeleton className="mb-2 h-4 w-14" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2.5 rounded-[14px] bg-[#ECEAE3] p-3">
            <Skeleton className="h-4 w-24 bg-card/60" />
            <Skeleton className="h-28 rounded-[11px] bg-card" />
            <Skeleton className="h-28 rounded-[11px] bg-card" />
          </div>
        ))}
      </div>
    </div>
  );
}
