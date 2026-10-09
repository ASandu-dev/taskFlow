import { cn } from "@/lib/utils";

const avatarSizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
} as const;

type AvatarSize = keyof typeof avatarSizes;

interface AvatarProps {
  initials: string;
  color: string;
  size?: AvatarSize;
  className?: string;
  alt?: string;
}

export function Avatar({ initials, color, size = "md", className, alt }: AvatarProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white",
        "shadow-sm",
        avatarSizes[size],
        className
      )}
      style={{ background: color } as React.CSSProperties}
      role="img"
      aria-label={alt || `Avatar for ${initials}`}
    >
      {initials}
    </div>
  );
}

interface AvatarGroupProps {
  avatars: Array<{ initials: string; color: string; name?: string }>;
  max?: number;
  size?: Exclude<AvatarSize, "xl">;
  className?: string;
}

export function AvatarGroup({ avatars, max = 4, size = "md", className }: AvatarGroupProps) {
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;
  return (
    <div className={cn("flex -space-x-2", className)} aria-label={`${avatars.length} people`}>
      {visible.map((avatar, index) => (
        <Avatar
          key={index}
          initials={avatar.initials}
          color={avatar.color}
          size={size}
          alt={avatar.name}
          className="ring-2 ring-white"
        />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-full font-medium text-slate-600 bg-slate-100 ring-2 ring-white",
            avatarSizes[size]
          )}
          aria-label={`${remaining} more`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
