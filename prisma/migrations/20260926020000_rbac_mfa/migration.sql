-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastUsedStep" INTEGER,
ADD COLUMN     "mfaPendingSecret" TEXT,
ADD COLUMN     "mfaSecret" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "portalSessionsValidAfter" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StaffRoleAssignment" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mfaVerifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffRoleAssignment_adminId_role_key" ON "StaffRoleAssignment"("adminId", "role");

-- CreateIndex
CREATE INDEX "StaffSession_adminId_idx" ON "StaffSession"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_adminId_idx" ON "MfaRecoveryCode"("adminId");

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Carry existing access over to role assignments (D-07, migration step M2).
-- Super admins stay super admins. Every other admin gets the transitional
-- "club_officer" role, which keeps the access they had, until the founder
-- assigns the officer roles (Gate #1 A4).
INSERT INTO "StaffRoleAssignment" ("id", "adminId", "role")
SELECT 'mig_' || md5("id" || ':role'),
       "id",
       CASE WHEN "role" = 'super_admin' THEN 'super_admin' ELSE 'club_officer' END
FROM "Admin";

INSERT INTO "AuditLog" ("actorType", "actorLabel", "action", "entityType", "entityId", "before", "after")
SELECT 'system', 'migration:20260926020000_rbac_mfa', 'staff.roles.migrate', 'admin', "id",
       jsonb_build_object('role', "role"),
       jsonb_build_object('roles', jsonb_build_array(CASE WHEN "role" = 'super_admin' THEN 'super_admin' ELSE 'club_officer' END))
FROM "Admin";

ALTER TABLE "Admin" DROP COLUMN "role";
