import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Hallmark Cobalt: badges are hairline chips, never filled pills. Status is
// text with one icon; colour comes from semantic ink (warn / ok / error / signal).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border border-rule px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink-2 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-rule-2 text-ink",
        secondary: "border-rule text-ink-3",
        destructive: "border-error/40 text-error",
        outline: "border-rule text-ink-2",
        ghost: "border-transparent text-ink-3",
        link: "border-transparent text-signal-deep underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
