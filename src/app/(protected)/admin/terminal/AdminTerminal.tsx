"use client";

import { useEffect, useRef, useState } from "react";

import { runAdminCommand } from "@/app/(protected)/admin/terminal/actions";
import { parseCommand } from "@/lib/admin/commands";

import styles from "./terminal.module.css";

type Line = { kind: "input" | "output" | "error"; text: string };

const LINE_CLASS = {
  input: "lineInput",
  output: "lineOutput",
  error: "lineError",
} as const;

const WELCOME: Line[] = [
  { kind: "output", text: "Ludo admin console. Type /help for commands." },
];

export function AdminTerminal() {
  const [history, setHistory] = useState<Line[]>(WELCOME);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [recallIndex, setRecallIndex] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [history]);

  async function submit(raw: string) {
    const line = raw.trim();
    if (!line) return;
    setValue("");
    setRecallIndex(null);
    setRecent((r) => [line, ...r].slice(0, 50));
    setHistory((h) => [...h, { kind: "input", text: `> ${line}` }]);

    if (parseCommand(line)?.name === "clear") {
      setHistory([]);
      return;
    }

    setBusy(true);
    try {
      const result = await runAdminCommand(line);
      setHistory((h) => [
        ...h,
        ...result.lines.map((text) => ({
          kind: result.ok ? ("output" as const) : ("error" as const),
          text,
        })),
      ]);
    } catch {
      setHistory((h) => [
        ...h,
        { kind: "error", text: "Command failed to run." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (recent.length === 0) return;
      const next = recallIndex === null ? 0 : Math.min(recallIndex + 1, recent.length - 1);
      setRecallIndex(next);
      setValue(recent[next]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (recallIndex === null) return;
      const next = recallIndex - 1;
      if (next < 0) {
        setRecallIndex(null);
        setValue("");
      } else {
        setRecallIndex(next);
        setValue(recent[next]);
      }
    }
  }

  return (
    <div
      className={styles.terminal}
      onClick={() => inputRef.current?.focus()}
      role="presentation"
    >
      <div aria-live="polite" className={styles.output}>
        {history.map((line, i) => (
          <div className={styles[LINE_CLASS[line.kind]]} key={i}>
            {line.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className={styles.prompt}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit(value);
        }}
      >
        <span aria-hidden="true" className={styles.caret}>
          ❯
        </span>
        <input
          aria-label="Admin command"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          autoFocus
          className={styles.input}
          disabled={busy}
          name="command"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          ref={inputRef}
          spellCheck={false}
          value={value}
        />
      </form>
    </div>
  );
}
