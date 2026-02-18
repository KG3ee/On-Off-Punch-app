import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  getHealth(): { status: string; message: string } {
    return {
      status: "ok",
      message: this.appService.getHello(),
    };
  }

  @Get("time")
  getTime(): { serverNow: string; timeZone: string } {
    return {
      serverNow: new Date().toISOString(),
      timeZone: process.env.APP_TIMEZONE || "Asia/Dubai",
    };
  }
}
