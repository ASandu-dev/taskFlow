export type EventCategory = "work" | "family" | "errands";

export interface CategoryDefinition {
  id: EventCategory;
  label: string;
  color: string;
}

export const EVENT_CATEGORIES: readonly CategoryDefinition[] = [
  { id: "work", label: "Work", color: "#3b82f6" },
  { id: "family", label: "Family", color: "#ec4899" },
  { id: "errands", label: "Errands", color: "#22c55e" },
] as const;

export const CATEGORY_IDS = EVENT_CATEGORIES.map((category) => category.id);

const CATEGORY_BY_ID = new Map<string, CategoryDefinition>(
  EVENT_CATEGORIES.map((category) => [category.id, category])
);

export function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && CATEGORY_BY_ID.has(value);
}

export function getCategory(id: string | null | undefined): CategoryDefinition | undefined {
  if (!id) return undefined;
  return CATEGORY_BY_ID.get(id);
}

export function getCategoryColor(id: string | null | undefined): string | undefined {
  return getCategory(id)?.color;
}

export function getCategoryLabel(id: string | null | undefined): string | undefined {
  return getCategory(id)?.label;
}
