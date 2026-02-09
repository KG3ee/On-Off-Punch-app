import { BreakDeductionMode, PrismaClient, Role } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminUsername = (process.env.SEED_ADMIN_USERNAME || 'admin').trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  if (!adminUsername) {
    throw new Error('SEED_ADMIN_USERNAME must not be blank');
  }
  const parsedRounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const rounds = Number.isFinite(parsedRounds) && parsedRounds > 0 ? parsedRounds : 12;
  const adminPasswordHash = await hash(adminPassword, rounds);

  const teamA = await prisma.team.upsert({
    where: { name: 'Team A' },
    update: {},
    create: { name: 'Team A' }
  });

  const teamB = await prisma.team.upsert({
    where: { name: 'Team B' },
    update: {},
    create: { name: 'Team B' }
  });

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      username: adminUsername,
      passwordHash: adminPasswordHash,
      mustChangePassword: true,
      displayName: 'System Admin',
      firstName: 'System',
      lastName: 'Admin',
      role: Role.ADMIN,
      teamId: teamA.id,
      isActive: true
    },
    create: {
      username: adminUsername,
      passwordHash: adminPasswordHash,
      mustChangePassword: true,
      displayName: 'System Admin',
      firstName: 'System',
      lastName: 'Admin',
      role: Role.ADMIN,
      teamId: teamA.id,
      isActive: true
    }
  });

  await prisma.breakPolicy.upsert({
    where: { code: 'wc' },
    update: {},
    create: { code: 'wc', name: 'Waste Control', expectedDurationMinutes: 10, dailyLimit: 5 }
  });

  await prisma.breakPolicy.upsert({
    where: { code: 'cy' },
    update: {},
    create: { code: 'cy', name: 'Smoking Break', expectedDurationMinutes: 10, dailyLimit: 3 }
  });

  await prisma.breakPolicy.upsert({
    where: { code: 'bwc' },
    update: {},
    create: { code: 'bwc', name: 'Big Waste Control', expectedDurationMinutes: 20, dailyLimit: 3 }
  });

  await prisma.breakPolicy.upsert({
    where: { code: 'cf+1' },
    update: {},
    create: { code: 'cf+1', name: 'Breakfast', expectedDurationMinutes: 25, dailyLimit: 1 }
  });

  await prisma.breakPolicy.upsert({
    where: { code: 'cf+2' },
    update: {},
    create: { code: 'cf+2', name: 'Lunch', expectedDurationMinutes: 30, dailyLimit: 1 }
  });

  await prisma.breakPolicy.upsert({
    where: { code: 'cf+3' },
    update: {},
    create: { code: 'cf+3', name: 'Dinner', expectedDurationMinutes: 30, dailyLimit: 1 }
  });

  await prisma.salaryRule.createMany({
    data: [
      {
        name: 'Default Hourly Rule',
        baseHourlyRate: 5,
        overtimeMultiplier: 1.5,
        latePenaltyPerMinute: 0,
        breakDeductionMode: BreakDeductionMode.NONE,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      }
    ],
    skipDuplicates: true
  });

  let teamAPreset = await prisma.shiftPreset.findFirst({
    where: { name: 'Team A Split Shift', teamId: teamA.id },
    include: { segments: true }
  });
  if (!teamAPreset) {
    teamAPreset = await prisma.shiftPreset.create({
      data: {
        name: 'Team A Split Shift',
        teamId: teamA.id,
        timezone: 'Asia/Dubai',
        isDefault: true,
        segments: {
          create: [
            { segmentNo: 1, startTime: '03:00', endTime: '12:00', crossesMidnight: false, lateGraceMinutes: 10 },
            { segmentNo: 2, startTime: '17:00', endTime: '20:00', crossesMidnight: false, lateGraceMinutes: 10 }
          ]
        }
      },
      include: { segments: true }
    });
  }

  let teamBPreset = await prisma.shiftPreset.findFirst({
    where: { name: 'Team B Split Night', teamId: teamB.id },
    include: { segments: true }
  });
  if (!teamBPreset) {
    teamBPreset = await prisma.shiftPreset.create({
      data: {
        name: 'Team B Split Night',
        teamId: teamB.id,
        timezone: 'Asia/Dubai',
        isDefault: true,
        segments: {
          create: [
            { segmentNo: 1, startTime: '22:00', endTime: '03:00', crossesMidnight: true, lateGraceMinutes: 10 },
            { segmentNo: 2, startTime: '05:00', endTime: '08:00', crossesMidnight: false, lateGraceMinutes: 10 }
          ]
        }
      },
      include: { segments: true }
    });
  }

  const assignmentFrom = new Date('2026-01-01T00:00:00.000Z');
  const existingAssignments = await prisma.shiftAssignment.findMany({
    where: {
      targetType: 'TEAM',
      targetId: { in: [teamA.id, teamB.id] },
      effectiveFrom: assignmentFrom
    }
  });

  if (!existingAssignments.find((a) => a.targetId === teamA.id)) {
    await prisma.shiftAssignment.create({
      data: {
        targetType: 'TEAM',
        targetId: teamA.id,
        shiftPresetId: teamAPreset.id,
        effectiveFrom: assignmentFrom
      }
    });
  }

  if (!existingAssignments.find((a) => a.targetId === teamB.id)) {
    await prisma.shiftAssignment.create({
      data: {
        targetType: 'TEAM',
        targetId: teamB.id,
        shiftPresetId: teamBPreset.id,
        effectiveFrom: assignmentFrom
      }
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seed complete. Admin login: ${adminUsername} / ${adminPassword} (change it after first login).`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
