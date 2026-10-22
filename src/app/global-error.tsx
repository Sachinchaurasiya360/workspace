"use client";

import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center font-sans text-foreground antialiased">
        <span className="rounded-[10px] bg-secondary px-3 py-1.5 font-mono text-[15px] font-medium text-secondary-foreground">
          Error
        </span>
        <h1 className="font-display text-[40px] tracking-[-0.025em] sm:text-[64px]">Something went wrong</h1>
        <p className="max-w-[520px] text-base leading-relaxed text-muted-foreground">
          Please try again, or reload the page.
        </p>
        <button
          onClick={reset}
          className="mt-2 flex h-12 items-center rounded-xl bg-primary px-[22px] text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-strong"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
