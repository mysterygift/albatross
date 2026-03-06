import * as React from "react"
import { cn } from "@/lib/utils"

type SegmentedOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

type SegmentedControlProps<T extends string> = {
  value: T
  onValueChange: (value: T) => void
  options: SegmentedOption<T>[]
  className?: string
  size?: "sm" | "md"
  ariaLabel?: string
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = "md",
  ariaLabel,
}: SegmentedControlProps<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )

  const count = options.length
  const widthPercent = 100 / Math.max(count, 1)

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex w-full rounded-xl border bg-muted/20 p-1",
        size === "sm" ? "h-9" : "h-10",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 rounded-lg bg-primary/15 border border-primary/20 transition-transform duration-200 ease-out"
        style={{
          width: `calc(${widthPercent}% - 4px)`,
          transform: `translateX(calc(${activeIndex} * 100% + ${activeIndex * 4}px))`,
          left: 4,
        }}
      />

      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={option.disabled}
            onClick={() => !option.disabled && onValueChange(option.value)}
            className={cn(
              "relative z-10 flex-1 rounded-lg px-3 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              size === "sm" ? "text-sm" : "text-sm",
              isActive
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
              option.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}




{ // Example usage:
    
    /* <SegmentedControl
  ariaLabel="Purchase type"
  value={watch("is_service_purchase") ? "service" : "goods"}
  onValueChange={(next) => {
    setValue("is_service_purchase", next === "service")
  }}
  options={[
    { value: "service", label: "Service" },
    { value: "goods", label: "Physical / Goods" },
  ]}
/> */}