"use client";

import { useEffect, useState } from "react";

/**
 * Minimal member shape the task UI needs from `GET /api/family/groups/[id]`.
 */
export interface FamilyMemberLite {
  userId: string;
  name: string;
  isYou: boolean;
}

interface GroupDetailResponse {
  members?: FamilyMemberLite[];
}

// Module-level cache so a list of tasks belonging to the same family shares a
// single request instead of one per item. Successful responses are cached for
// the session; failures are retried on the next mount.
const cache = new Map<string, FamilyMemberLite[]>();
const inflight = new Map<string, Promise<FamilyMemberLite[]>>();

/**
 * Drop cached members after a membership change (remove/transfer/leave) so task
 * assignment options do not keep offering users who are no longer in the group.
 */
export function invalidateFamilyMembers(groupId?: string): void {
  if (groupId) {
    cache.delete(groupId);
    return;
  }
  cache.clear();
}

async function fetchMembers(groupId: string): Promise<FamilyMemberLite[]> {
  const cached = cache.get(groupId);
  if (cached) return cached;
  const pending = inflight.get(groupId);
  if (pending) return pending;

  const request = fetch(`/api/family/groups/${groupId}`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to load family members.");
      const data = (await response.json()) as GroupDetailResponse;
      const members = Array.isArray(data.members) ? data.members : [];
      cache.set(groupId, members);
      return members;
    })
    .finally(() => {
      inflight.delete(groupId);
    });

  inflight.set(groupId, request);
  return request;
}

/**
 * Members of a family group, or `null` while loading / when the group is not
 * family-scoped. Safe to call with `null` for personal tasks.
 */
export function useFamilyMembers(groupId: string | null | undefined): FamilyMemberLite[] | null {
  const [members, setMembers] = useState<FamilyMemberLite[] | null>(() =>
    groupId ? cache.get(groupId) ?? null : null
  );

  useEffect(() => {
    if (!groupId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when scope changes
      setMembers(null);
      return;
    }
    const cached = cache.get(groupId);
    if (cached) {
      setMembers(cached);
      return;
    }
    let active = true;
    fetchMembers(groupId)
      .then((loaded) => {
        if (active) setMembers(loaded);
      })
      .catch(() => {
        if (active) setMembers([]);
      });
    return () => {
      active = false;
    };
  }, [groupId]);

  return members;
}
