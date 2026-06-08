import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
  {
    variants: {
      variant: {
        listening: "bg-primary/10 text-primary border border-primary/20",
        processing: "bg-warning/10 text-warning-foreground border border-warning/20",
        ready: "bg-success/10 text-success border border-success/20",
        approved: "bg-success text-success-foreground",
        pending: "bg-muted text-muted-foreground border border-border",
        urgent: "bg-urgent/10 text-urgent border border-urgent/20",
      },
      size: {
        sm: "text-xs px-2 py-0.5",
        md: "text-xs px-3 py-1",
        lg: "text-sm px-4 py-1.5",
      },
    },
    defaultVariants: {
      variant: "pending",
      size: "md",
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  pulse?: boolean;
}

export function StatusBadge({
  className,
  variant,
  size,
  pulse,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        statusBadgeVariants({ variant, size }),
        pulse && "animate-pulse-soft",
        className
      )}
      {...props}
    >
      {(variant === "listening" || variant === "processing") && (
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              variant === "listening" && "bg-primary",
              variant === "processing" && "bg-warning"
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              variant === "listening" && "bg-primary",
              variant === "processing" && "bg-warning"
            )}
          />
        </span>
      )}
      {variant === "ready" && (
        <span className="h-2 w-2 rounded-full bg-success" />
      )}
      {variant === "approved" && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {children}
    </span>
  );
}
