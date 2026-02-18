/*
  Warnings:

  - You are about to drop the column `phoneLast4` on the `EmployeeRoster` table. All the data in the column will be lost.
  - You are about to drop the column `phoneLast4` on the `RegistrationRequest` table. All the data in the column will be lost.
  - You are about to drop the `PayrollItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PayrollRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SalaryRule` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PayrollItem" DROP CONSTRAINT "PayrollItem_payrollRunId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollItem" DROP CONSTRAINT "PayrollItem_userId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRun" DROP CONSTRAINT "PayrollRun_createdById_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRun" DROP CONSTRAINT "PayrollRun_finalizedById_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRun" DROP CONSTRAINT "PayrollRun_salaryRuleId_fkey";

-- DropForeignKey
ALTER TABLE "PayrollRun" DROP CONSTRAINT "PayrollRun_teamId_fkey";

-- DropForeignKey
ALTER TABLE "SalaryRule" DROP CONSTRAINT "SalaryRule_createdById_fkey";

-- AlterTable
ALTER TABLE "EmployeeRoster" DROP COLUMN "phoneLast4";

-- AlterTable
ALTER TABLE "RegistrationRequest" DROP COLUMN "phoneLast4";

-- DropTable
DROP TABLE "PayrollItem";

-- DropTable
DROP TABLE "PayrollRun";

-- DropTable
DROP TABLE "SalaryRule";

-- DropEnum
DROP TYPE "BreakDeductionMode";

-- DropEnum
DROP TYPE "PayrollRunStatus";
