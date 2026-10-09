"use client";

import { forwardRef, useId, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, leftElement, rightElement, id, ...props }, ref) => {
    // useId is SSR-safe and deterministic, unlike Math.random() which breaks
    // Next.js prerendering of client components.
    const reactId = useId();
    const inputId = id || `input-${reactId}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {(leftIcon || leftElement) && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              {leftElement || leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full bg-white border rounded-xl text-slate-900 placeholder:text-slate-400",
              "transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500",
              "disabled:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
              "hover:border-slate-300",
              error && "border-red-300 focus:border-red-500 focus:ring-red-500/20",
              !error && "border-slate-200",
              leftIcon || leftElement ? "pl-10" : "px-4",
              rightIcon || rightElement ? "pr-10" : "px-4",
              "py-2.5 text-sm",
              className
            )}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            {...props}
          />
          {(rightIcon || rightElement) && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              {rightElement || rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-sm text-slate-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const reactId = useId();
    const inputId = id || `textarea-${reactId}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "w-full bg-white border rounded-xl text-slate-900 placeholder:text-slate-400",
            "transition-all duration-200 resize-y min-h-[100px]",
            "focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500",
            "disabled:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
            "hover:border-slate-300",
            error && "border-red-300 focus:border-red-500 focus:ring-red-500/20",
            !error && "border-slate-200",
            "px-4 py-2.5 text-sm",
            className
          )}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1.5 text-sm text-slate-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
