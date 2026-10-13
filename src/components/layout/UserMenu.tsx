"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { ChevronDown, Settings, LogOut } from "lucide-react";
import { useTaskStore } from "@/lib/store";
import { useUserSource } from "@/lib/user-bridge";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  /** Show the user's name/plan next to the avatar (e.g. sidebar bottom row). */
  showName?: boolean;
  /** "dark" for dark surfaces (sidebar), "light" for white surfaces (header, modals). */
  tone?: "dark" | "light";
  /** Avatar size for the trigger. */
  avatarSize?: "sm" | "md";
  /** Called before navigating away, e.g. to close a parent modal. */
  onNavigate?: () => void;
  className?: string;
}

/**
 * Dropdown menu opened by clicking the user's avatar. Contains the user's
 * identity and a "Settings" entry. Positioned with `fixed` coordinates so it
 * works equally well in the sidebar (opens upward), the header, and modals.
 */
export function UserMenu({ showName = false, tone = "light", avatarSize = "sm", onNavigate, className }: UserMenuProps) {
  const { user } = useTaskStore();
  const { clerkEnabled } = useUserSource();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while open.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Move focus into the panel when it opens so keyboard users land on the
  // first action instead of the (portal) end of the document.
  useEffect(() => {
    if (!open || !position) return;
    menuRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
  }, [open, position]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 240;
    const menuHeight = 180;
    let left = rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    let top = rect.bottom + 8;
    // Open upward when there is no room below the trigger (e.g. sidebar bottom).
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - 8;
    }
    setPosition({ top, left });
    setOpen(true);
  }

  if (!user) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="user-menu"
        aria-label={showName ? undefined : `Open menu for ${user.name}`}
        className={cn(
          "flex items-center gap-3 rounded-xl text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2",
          showName
            ? cn(
                "w-full px-2 py-1.5",
                tone === "dark" ? "hover:bg-white/5" : "hover:bg-slate-100"
              )
            : "min-h-11 min-w-11 shrink-0 justify-center rounded-full hover:opacity-80",
          className
        )}
      >
        <Avatar initials={user.initials} color={user.avatarColor} size={avatarSize} alt={user.name} imageUrl={user.imageUrl} emoji={user.avatarEmoji ?? undefined} />
        {showName && (
          <>
            <span className="flex-1 min-w-0">
              <span className={cn("block text-sm font-medium truncate", tone === "dark" ? "text-white" : "text-slate-900")}>
                {user.name}
              </span>
              <span className={cn("block text-xs truncate", tone === "dark" ? "text-slate-400" : "text-slate-500")}>
                {user.plan}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                tone === "dark" ? "text-slate-400" : "text-slate-400",
                open && "rotate-180"
              )}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {open && position && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id="user-menu"
            style={{ top: position.top, left: position.left, width: 240 }}
            className="fixed z-[70] rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 animate-fade-in overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <Avatar initials={user.initials} color={user.avatarColor} size="sm" alt={user.name} imageUrl={user.imageUrl} emoji={user.avatarEmoji ?? undefined} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.plan}</p>
              </div>
            </div>
            <div className="p-1.5">
              <Link
                href="/settings"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <Settings className="h-4 w-4 text-slate-400" aria-hidden="true" />
                Settings
              </Link>
              {clerkEnabled && (
                <ClerkSignOutButton
                  onSignedOut={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                />
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Own component so `useClerk()` is only invoked when Clerk is actually
 * configured (the plain-user fallback renders no sign-out entry).
 */
function ClerkSignOutButton({ onSignedOut }: { onSignedOut: () => void }) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => {
        onSignedOut();
        void signOut({ redirectUrl: "/" });
      }}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      <LogOut className="h-4 w-4 text-slate-400" aria-hidden="true" />
      Sign out
    </button>
  );
}