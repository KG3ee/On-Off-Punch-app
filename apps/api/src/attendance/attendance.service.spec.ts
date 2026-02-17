import { Test, TestingModule } from "@nestjs/testing";
import { AttendanceService } from "./attendance.service";
import { PrismaService } from "../prisma/prisma.service";

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

describe("AttendanceService", () => {
  let service: AttendanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
