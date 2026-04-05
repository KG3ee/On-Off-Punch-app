import { Test, TestingModule } from "@nestjs/testing";
import { AttendanceService } from "./attendance.service";
import { PrismaService } from "../prisma/prisma.service";
import { ShiftsService } from "../shifts/shifts.service";
import { DeductionsService } from "../deductions/deductions.service";
import { ClientSyncService } from "../client-sync/client-sync.service";

const mockPrismaService = {
  dutySession: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  auditEvent: {
    create: jest.fn(),
  },
};

const mockShiftsService = {};
const mockDeductionsService = {};
const mockClientSyncService = {
  findReceiptResponse: jest.fn(),
};

describe("AttendanceService", () => {
  let service: AttendanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ShiftsService, useValue: mockShiftsService },
        { provide: DeductionsService, useValue: mockDeductionsService },
        { provide: ClientSyncService, useValue: mockClientSyncService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
