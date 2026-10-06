import type { AcademyProfile } from "../domain/academyProfile";
import type { AcademyProfileSource } from "./academyProfileSource";

/**
 * Future adapter slot only. This implementation performs no network or
 * database access until a reviewed Root transport is added in a later phase.
 */
export class NoeliaMainProfileSource implements AcademyProfileSource {
  async loadProfile(): Promise<AcademyProfile> {
    throw new Error("The Noélia main profile adapter is not connected.");
  }
}
