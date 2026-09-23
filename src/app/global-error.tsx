"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-gray-900">Something went wrong</p>
          <p className="text-sm text-gray-500">Please try again, or reload the page.</p>
          <button
            onClick={reset}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
