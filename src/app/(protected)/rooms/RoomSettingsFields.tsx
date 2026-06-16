import { RULESETS, TURN_TIMER_OPTIONS } from "@/lib/rooms/rooms";
import type { Ruleset } from "@/lib/ludo";
import type { TurnTimer } from "@/lib/rooms/rooms";

import styles from "./rooms.module.css";

interface RoomSettingsFieldsProps {
  readonly ruleset?: Ruleset;
  readonly maxPlayers?: number;
  readonly boardSkin?: string;
  readonly turnTimer?: TurnTimer;
}

const RULESET_LABELS: Record<Ruleset, string> = {
  classic: "Classic",
  nigerian: "Nigerian",
};

function timerValue(timer: TurnTimer): string {
  return timer === null ? "none" : String(timer);
}

function timerLabel(timer: TurnTimer): string {
  return timer === null ? "No timer" : `${timer} seconds`;
}

export function RoomSettingsFields({
  ruleset = "classic",
  maxPlayers = 4,
  boardSkin = "classic",
  turnTimer = null,
}: RoomSettingsFieldsProps) {
  return (
    <div className={styles.fields}>
      <label>
        <span>Rules</span>
        <select defaultValue={ruleset} name="ruleset">
          {RULESETS.map((value) => (
            <option key={value} value={value}>
              {RULESET_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Players</span>
        <select defaultValue={String(maxPlayers)} name="maxPlayers">
          {[2, 3, 4].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Turn timer</span>
        <select defaultValue={timerValue(turnTimer)} name="turnTimer">
          {TURN_TIMER_OPTIONS.map((value) => (
            <option key={timerValue(value)} value={timerValue(value)}>
              {timerLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Board skin</span>
        <select defaultValue={boardSkin} name="boardSkin">
          <option value="classic">Classic</option>
        </select>
      </label>
    </div>
  );
}
