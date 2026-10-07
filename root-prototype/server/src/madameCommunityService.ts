import { MadameCommunityServiceBase } from "@noelia-root/gen-server";
import { MadameCommunityEvent } from "@noelia-root/gen-shared";

export class MadameCommunityService extends MadameCommunityServiceBase {
  broadcastMadameEvent(event: MadameCommunityEvent): void {
    this.broadcastCreated(event, "all");
  }
}

export const madameCommunityService = new MadameCommunityService();
