/**
 * @typedef {import("./components/Madame").MadameMood} MadameMood
 */

/**
 * @param {import("@noelia-root/gen-shared").MadameCommunityEvent} event
 * @param {(mood: MadameMood, message: string) => void} update
 */
export function applyCommunityMadameEvent(event, update) {
  const mood = event.mood === "greeting" ? "greeting" : "explaining";
  update(mood, event.message);
}
