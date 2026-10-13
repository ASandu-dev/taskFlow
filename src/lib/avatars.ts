/**
 * Canonical preset avatars. This list is the single source of truth shared by
 * the API (validation) and the frontend (rendering), so an id stored in Clerk
 * can never drift from what the UI knows how to draw.
 *
 * Backgrounds are CSS `linear-gradient` values tuned to read clearly on both
 * the dark sidebar and white content surfaces.
 */
export interface AvatarPreset {
  id: string;
  emoji: string;
  background: string;
  label: string;
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: "fox", emoji: "🦊", background: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)", label: "Fox" },
  { id: "panda", emoji: "🐼", background: "linear-gradient(135deg, #475569 0%, #94a3b8 100%)", label: "Panda" },
  { id: "lion", emoji: "🦁", background: "linear-gradient(135deg, #d97706 0%, #fcd34d 100%)", label: "Lion" },
  { id: "frog", emoji: "🐸", background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)", label: "Frog" },
  { id: "octopus", emoji: "🐙", background: "linear-gradient(135deg, #7c3aed 0%, #c084fc 100%)", label: "Octopus" },
  { id: "owl", emoji: "🦉", background: "linear-gradient(135deg, #4338ca 0%, #60a5fa 100%)", label: "Owl" },
  { id: "whale", emoji: "🐳", background: "linear-gradient(135deg, #0284c7 0%, #22d3ee 100%)", label: "Whale" },
  { id: "butterfly", emoji: "🦋", background: "linear-gradient(135deg, #db2777 0%, #f0abfc 100%)", label: "Butterfly" },
  { id: "rocket", emoji: "🚀", background: "linear-gradient(135deg, #dc2626 0%, #fb923c 100%)", label: "Rocket" },
  { id: "star", emoji: "⭐", background: "linear-gradient(135deg, #eab308 0%, #fde047 100%)", label: "Star" },
];

const PRESETS_BY_ID = new Map(AVATAR_PRESETS.map((preset) => [preset.id, preset]));

/** True when `value` is a string matching one of the known preset ids. */
export function isAvatarPreset(value: unknown): value is string {
  return typeof value === "string" && PRESETS_BY_ID.has(value);
}

/** Resolves a preset id to its definition, or null when unknown/absent. */
export function getAvatarPreset(id: string | null | undefined): AvatarPreset | null {
  if (!id) return null;
  return PRESETS_BY_ID.get(id) ?? null;
}
