"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-foreground text-background border border-foreground hover:bg-[#262626] active:bg-[#404040] disabled:bg-[#a3a3a3] disabled:border-[#a3a3a3]",
  secondary:
    "bg-background text-foreground border border-foreground hover:bg-foreground hover:text-background active:bg-[#262626] active:text-background disabled:opacity-50",
  ghost:
    "bg-transparent text-foreground border border-transparent hover:bg-[#e5e5e5] active:bg-[#d4d4d4] disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center font-medium tracking-tight rounded-sm",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
