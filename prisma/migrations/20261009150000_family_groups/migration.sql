-- Family groups: an admin creates a group, family members join it via invite
-- code, and events tagged with a group are shared with all its members.
CREATE TABLE "FamilyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inviteCode" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyGroupMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CalendarEvent" ADD COLUMN "familyGroupId" TEXT;

CREATE UNIQUE INDEX "FamilyGroup_inviteCode_key" ON "FamilyGroup"("inviteCode");
CREATE INDEX "FamilyGroup_adminId_idx" ON "FamilyGroup"("adminId");
CREATE UNIQUE INDEX "FamilyGroupMember_groupId_userId_key" ON "FamilyGroupMember"("groupId", "userId");
CREATE INDEX "FamilyGroupMember_userId_idx" ON "FamilyGroupMember"("userId");
CREATE INDEX "CalendarEvent_familyGroupId_idx" ON "CalendarEvent"("familyGroupId");

ALTER TABLE "FamilyGroupMember" ADD CONSTRAINT "FamilyGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_familyGroupId_fkey" FOREIGN KEY ("familyGroupId") REFERENCES "FamilyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
