import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [ReportsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
