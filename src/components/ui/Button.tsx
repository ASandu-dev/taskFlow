import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
      primary: "bg-gradient-to-r from-purple-500 to-violet-600 text-white hover:from-purple-600 hover:to-violet-700 active:from-purple-700 active:to-violet-800 shadow-sm",
      secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100",
      ghost: "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
      outline: "border-2 border-slate-200 text-slate-700 hover:border-purple-500 hover:text-purple-600 active:border-purple-600 active:text-purple-700 bg-transparent",
    };
    
    const sizes = {
      sm: "px-3 py-1.5 text-sm rounded-xl gap-1.5",
      md: "px-4 py-2 text-sm rounded-xl gap-2",
      lg: "px-6 py-3 text-base rounded-xl gap-2",
      // Icon-only buttons must meet the 44px minimum touch target (WCAG 2.5.5).
      icon: "p-2.5 min-h-11 min-w-11 rounded-xl",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
