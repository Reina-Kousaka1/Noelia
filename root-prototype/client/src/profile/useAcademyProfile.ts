import { useEffect, useState } from "react";
import type { AcademyProfile } from "../domain/academyProfile";
import { academyProfileSource } from "./academyProfileRepository";

export type AcademyProfileLoadState = {
  readonly profile: AcademyProfile | null;
  readonly isLoading: boolean;
  readonly hasError: boolean;
};

export function useAcademyProfile(): AcademyProfileLoadState {
  const [state, setState] = useState<AcademyProfileLoadState>({
    profile: null,
    isLoading: true,
    hasError: false,
  });

  useEffect(() => {
    let isCurrent = true;
    setState({ profile: null, isLoading: true, hasError: false });
    academyProfileSource
      .loadProfile()
      .then((profile) => {
        if (isCurrent) setState({ profile, isLoading: false, hasError: false });
      })
      .catch(() => {
        if (isCurrent) setState({ profile: null, isLoading: false, hasError: true });
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return state;
}
