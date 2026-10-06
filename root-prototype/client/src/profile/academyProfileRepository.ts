import type { AcademyProfileSource } from "./academyProfileSource";
import { devProfileSource } from "./devProfileSource";

// Swap this one binding when a safe Root read transport is introduced.
export const academyProfileSource: AcademyProfileSource = devProfileSource;
