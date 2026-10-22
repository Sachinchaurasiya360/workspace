import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="rounded-[10px] bg-secondary px-3 py-1.5 font-mono text-[15px] font-medium text-secondary-foreground">
        404
      </span>
      <h1 className="font-display text-[40px] tracking-[-0.025em] sm:text-[64px]">We couldn&apos;t find that page</h1>
      <p className="max-w-[520px] text-base leading-relaxed text-muted-foreground">
        It may have been moved or deleted, or you may not have access to it. Check the link, or head back to your
        dashboard.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2.5">
        <Button asChild size="lg" className="h-12 rounded-xl px-[22px] text-[15px]">
          <Link href="/">Go to dashboard</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-5 text-[15px]">
          <Link href="/search">Search the workspace</Link>
        </Button>
      </div>
    </div>
  );
}
