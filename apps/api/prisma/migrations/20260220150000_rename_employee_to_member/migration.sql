-- Rename EMPLOYEE enum value to MEMBER
ALTER TYPE "Role" RENAME VALUE 'EMPLOYEE' TO 'MEMBER';

-- Update default for the role column
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"Role";
