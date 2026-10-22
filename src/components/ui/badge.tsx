import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-muted text-secondary-foreground",
        primary: "border-transparent bg-primary-soft text-primary-strong",
        success: "border-transparent bg-[#d5efe4] text-[#135c40]",
        warning: "border-transparent bg-warning-soft text-warning-foreground",
        destructive: "border-transparent bg-[#f8e3e0] text-destructive",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
