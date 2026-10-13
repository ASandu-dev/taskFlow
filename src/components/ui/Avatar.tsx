import { cn } from "@/lib/utils";

const avatarSizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
} as const;

// Initials need a smaller font than the circle suggests; emoji glyphs render
// small relative to their font size, so they get a larger one per size.
const initialsSizes = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
} as const;

const emojiSizes = {
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
  xl: "text-3xl",
} as const;

type AvatarSize = keyof typeof avatarSizes;

interface AvatarProps {
  initials: string;
  color: string;
  size?: AvatarSize;
  className?: string;
  alt?: string;
  imageUrl?: string | null;
  /** Preset emoji rendered on the `color` background when no image is set. */
  emoji?: string;
}

export function Avatar({ initials, color, size = "md", className, alt, imageUrl, emoji }: AvatarProps) {
  const shared = cn(
    "inline-flex items-center justify-center rounded-full font-semibold text-white",
    "shadow-sm",
    avatarSizes[size],
    className
  );
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={alt || `Avatar for ${initials}`}
        className={cn(shared, "object-cover")}
        role="img"
        aria-label={alt || `Avatar for ${initials}`}
      />
    );
  }
  return (
    <div
      className={cn(shared, emoji ? emojiSizes[size] : initialsSizes[size])}
      style={{ background: color } as React.CSSProperties}
      role="img"
      aria-label={alt || `Avatar for ${initials}`}
    >
      {emoji || initials}
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
            avatarSizes[size],
            initialsSizes[size]
          )}
          aria-label={`${remaining} more`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
