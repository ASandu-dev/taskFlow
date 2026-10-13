import { describe, expect, it } from "vitest";

import { AVATAR_PRESETS, getAvatarPreset, isAvatarPreset } from "@/lib/avatars";

describe("avatar presets", () => {
  it("exposes 10 presets with unique ids, emoji, and gradient backgrounds", () => {
    expect(AVATAR_PRESETS).toHaveLength(10);
    expect(new Set(AVATAR_PRESETS.map((preset) => preset.id)).size).toBe(10);
    expect(new Set(AVATAR_PRESETS.map((preset) => preset.emoji)).size).toBe(10);
    for (const preset of AVATAR_PRESETS) {
      expect(preset.background.startsWith("linear-gradient(")).toBe(true);
      expect(preset.emoji.length).toBeGreaterThan(0);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("validates known preset ids only", () => {
    expect(isAvatarPreset("fox")).toBe(true);
    for (const preset of AVATAR_PRESETS) {
      expect(isAvatarPreset(preset.id)).toBe(true);
    }
    expect(isAvatarPreset("dragon")).toBe(false);
    expect(isAvatarPreset("")).toBe(false);
    expect(isAvatarPreset(null)).toBe(false);
    expect(isAvatarPreset(42)).toBe(false);
    expect(isAvatarPreset({ id: "fox" })).toBe(false);
  });

  it("resolves presets and returns null for unknown or absent ids", () => {
    expect(getAvatarPreset("panda")?.label).toBe("Panda");
    expect(getAvatarPreset("nope")).toBeNull();
    expect(getAvatarPreset(null)).toBeNull();
    expect(getAvatarPreset(undefined)).toBeNull();
  });
});
