import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "subtle";
};

export function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-fg hover:opacity-90",
        variant === "ghost" && "text-fg hover:bg-border/60",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "subtle" && "bg-border/60 text-fg hover:bg-border",
        className,
      )}
      {...props}
    />
  );
}
