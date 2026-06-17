export interface ParsedCommand {
  readonly name: string;
  readonly args: readonly string[];
}

export interface CommandResult {
  readonly ok: boolean;
  readonly lines: string[];
}

/** Parse a terminal line like "/give @ada 500" into a command + args. */
export function parseCommand(line: string): ParsedCommand | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const body = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const parts = body.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

export interface CommandSpec {
  readonly usage: string;
  readonly description: string;
}

export const COMMANDS: readonly CommandSpec[] = [
  { usage: "/help", description: "List the available commands." },
  {
    usage: "/give <user> <amount>",
    description: "Give coins to a player (use a negative amount to take).",
  },
  { usage: "/take <user> <amount>", description: "Take coins from a player." },
  {
    usage: "/setcoins <user> <amount>",
    description: "Set a player's coin balance to an exact value.",
  },
  { usage: "/giveall <amount>", description: "Give coins to every player." },
  { usage: "/ban <user>", description: "Ban a player from the app." },
  { usage: "/unban <user>", description: "Lift a player's ban." },
  {
    usage: "/grant <user> <code>",
    description: "Grant a cosmetic to a player by its code (e.g. ninja).",
  },
  { usage: "/promote <user>", description: "Give a player the admin role." },
  { usage: "/demote <user>", description: "Remove a player's admin role." },
  { usage: "/whois <user>", description: "Show a player's account details." },
  { usage: "/find <query>", description: "Search players by name or username." },
  { usage: "/users [query]", description: "List or search players." },
  { usage: "/stats", description: "Show server-wide totals." },
  { usage: "/clear", description: "Clear the terminal output." },
];

/** Strip a leading "@" from a user identifier argument. */
export function normalizeUserArg(arg: string | undefined): string {
  return (arg ?? "").replace(/^@/, "").trim();
}

export function helpLines(): string[] {
  const width = COMMANDS.reduce((max, c) => Math.max(max, c.usage.length), 0);
  return [
    "Available commands:",
    ...COMMANDS.map((c) => `  ${c.usage.padEnd(width)}  ${c.description}`),
  ];
}
