import type { AcademyProfile } from "../domain/academyProfile";

/** Replaceable read-only adapter boundary for the Noélia domain. */
export interface AcademyProfileSource {
  loadProfile(): Promise<AcademyProfile>;
}
