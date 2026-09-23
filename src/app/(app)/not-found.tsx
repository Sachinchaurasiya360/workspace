import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium">Page not found</p>
          <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
