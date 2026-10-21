/**
 * @typedef {import("./components/Madame").MadameMood} MadameMood
 */

/**
 * @param {import("@noelia-root/gen-shared").MadameCommunityEvent} event
 * @param {(mood: MadameMood, message: string) => void} update
 */
export function applyCommunityMadameEvent(event, update) {
  if (typeof update !== "function" || typeof event !== "object" || event === null) return false;
  if (typeof event.message !== "string" || !event.message.trim() || event.message.length > 2000) return false;

  const validMoods = new Set(["idle", "greeting", "explaining", "approving", "correcting", "celebrating"]);
  const mood = validMoods.has(event.mood) ? event.mood : "explaining";
  update(mood, event.message);
  return true;
}
