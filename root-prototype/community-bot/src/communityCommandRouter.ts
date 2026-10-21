import {
  communityHelpResponse,
  madameInteraction,
  teacherInteraction,
} from "@noelia-root/persona";
import type { MadameInteraction } from "@noelia-root/persona";
import type { CommunityCommandParseResult } from "./communityCommandParser";

export function routeCommunityCommand(
  parsed: CommunityCommandParseResult,
  variationKey: string,
): MadameInteraction | undefined {
  if (parsed.kind === "ignore") return undefined;
  if (parsed.kind === "malformed" || parsed.kind === "unknown") {
    return madameInteraction("command_error", variationKey);
  }

  switch (parsed.command.name) {
    case "help": {
      const response = madameInteraction("help", variationKey);
      return { ...response, message: communityHelpResponse(variationKey) };
    }
    case "status":
      return madameInteraction("status", variationKey);
    case "greeting":
      return madameInteraction("greeting", variationKey);
    case "casual":
      return madameInteraction("casual", variationKey);
    case "ballet":
      return teacherInteraction({ kind: parsed.command.signal, variationKey });
    case "style":
      return madameInteraction("fashion", variationKey);
    case "luxury":
      return madameInteraction("luxury", variationKey);
  }
}
