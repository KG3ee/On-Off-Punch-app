import { Body, Controller, Headers, Post } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { RunMonthlyJobDto } from "./dto/run-monthly-job.dto";

@Controller("internal/jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post("run-daily")
  async runDaily(@Headers("x-job-secret") secret?: string) {
    return this.jobsService.runDailyJobs(secret);
  }

  @Post("auto-close-breaks")
  async runAutoCloseBreaks(@Headers("x-job-secret") secret?: string) {
    return this.jobsService.runAutoCloseBreaks(secret);
  }

  @Post("auto-close-stale-duty")
  async runAutoCloseStaleDuty(@Headers("x-job-secret") secret?: string) {
    return this.jobsService.runAutoCloseStaleDuty(secret);
  }

  @Post("monthly-snapshot")
  async runMonthlySnapshot(
    @Headers("x-job-secret") secret: string | undefined,
    @Body() dto: RunMonthlyJobDto,
  ) {
    return this.jobsService.runMonthlySnapshot(secret, dto);
  }
}
