import type { KeystrokeEvent } from "../types/recording";

export interface KeystrokeChip {
  id: string;
  /** Pretty character label, e.g. `⌘`, `⇧`, `A`, `Space`. */
  label: string;
  /** True if this chip represents a modifier key. */
  modifier: boolean;
  processTimeMs: number;
}

const MODIFIER_ALIASES: Record<string, string> = {
  shift: "⇧",
  control: "⌃",
  option: "⌥",
  alt: "⌥",
  command: "⌘",
  cmd: "⌘",
  meta: "⌘",
};

const SPECIAL_KEYS: Record<string, string> = {
  " ": "Space",
  "\t": "Tab",
  "\n": "Return",
  "\r": "Return",
  "\u001b": "Esc",
  "\u007f": "Delete",
  "\u0008": "Backspace",
};

function prettyCharacter(char: string): string {
  if (char.length === 0) return "";
  const special = SPECIAL_KEYS[char];
  if (special) return special;
  if (char.length === 1) {
    return char.toUpperCase();
  }
  return char;
}

const MODIFIER_NAMES = new Set([
  "shift",
  "control",
  "option",
  "alt",
  "command",
  "cmd",
  "meta",
]);

function isModifierChar(char: string): boolean {
  return MODIFIER_NAMES.has(char.toLowerCase());
}

/**
 * Project a single `keyDown` event to one or more chips.
 *
 * Modifier-only key presses become one chip each. Character key presses with
 * active modifiers collapse into a single combined chip (e.g. `⌘ + S`).
 */
export function eventToChips(event: KeystrokeEvent): KeystrokeChip[] {
  if (event.type !== "keyDown") return [];
  if (event.isARepeat) return [];

  const isModifierOnly = isModifierChar(event.character);
  const modifierLabels = event.activeModifiers
    .map((m) => MODIFIER_ALIASES[m.toLowerCase()])
    .filter((m): m is string => Boolean(m));

  if (isModifierOnly) {
    const label = MODIFIER_ALIASES[event.character.toLowerCase()] ?? event.character;
    return [
      {
        id: `${event.processTimeMs}-${event.character}-mod`,
        label,
        modifier: true,
        processTimeMs: event.processTimeMs,
      },
    ];
  }

  const charLabel = prettyCharacter(event.character);
  if (charLabel.length === 0) return [];

  const combinedLabel =
    modifierLabels.length > 0
      ? `${modifierLabels.join(" ")} ${charLabel}`
      : charLabel;

  return [
    {
      id: `${event.processTimeMs}-${charLabel}`,
      label: combinedLabel,
      modifier: false,
      processTimeMs: event.processTimeMs,
    },
  ];
}

/**
 * Return the chips that should be visible at `sourceTimeMs`, given a sorted
 * keystroke log. Callers pass the visibility window and a hard cap to bound
 * render cost.
 */
export function chipsAtTime(
  events: KeystrokeEvent[],
  sourceTimeMs: number,
  visibleDurationMs: number,
  maxChips: number,
): KeystrokeChip[] {
  if (events.length === 0 || visibleDurationMs <= 0) return [];

  const windowStart = sourceTimeMs - visibleDurationMs;
  const chips: KeystrokeChip[] = [];

  // Walk newest-first so we hit `maxChips` quickly.
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i];
    if (evt.processTimeMs > sourceTimeMs) continue;
    if (evt.processTimeMs < windowStart) break;
    const newChips = eventToChips(evt);
    for (const chip of newChips) {
      chips.push(chip);
      if (chips.length >= maxChips) {
        return chips.reverse();
      }
    }
  }
  return chips.reverse();
}
