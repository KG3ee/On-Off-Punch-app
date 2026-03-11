import { Global, Module } from "@nestjs/common";
import { ClientSyncService } from "./client-sync.service";

@Global()
@Module({
  providers: [ClientSyncService],
  exports: [ClientSyncService],
})
export class ClientSyncModule {}
