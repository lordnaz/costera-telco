import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Hallmark Cobalt keycaps: a real 3px bottom edge, 1px lift on hover, sink on
// press. Focus is the base-layer outline (instant, never faded). One filled
// primary recipe: the solid signal key.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[transform,box-shadow,background-color,color,border-color] duration-120 ease-[var(--ease-out)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-error [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-signal-edge bg-signal text-signal-ink shadow-[var(--shadow-key-accent)] hover:-translate-y-px hover:bg-signal-deep active:translate-y-[3px] active:shadow-[var(--shadow-key-press)]",
        destructive:
          "border border-error-edge bg-error text-white shadow-[var(--shadow-key-error)] hover:-translate-y-px dark:text-graphite active:translate-y-[3px] active:shadow-[var(--shadow-key-press)]",
        outline:
          "border border-rule-2 bg-key-face text-ink shadow-[var(--shadow-key)] hover:-translate-y-px hover:bg-paper-2 active:translate-y-[3px] active:shadow-[var(--shadow-key-press)]",
        secondary:
          "border border-rule bg-paper-3 text-ink hover:bg-paper-2 active:translate-y-px",
        ghost:
          "text-ink-2 hover:bg-paper-2 hover:text-ink active:bg-paper-3",
        link: "text-signal-deep underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-8 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 hit-44",
        "icon-xs": "size-8 hit-44 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 hit-44",
        "icon-lg": "size-10 hit-44",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
