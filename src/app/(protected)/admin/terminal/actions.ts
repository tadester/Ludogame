"use server";

import {
  helpLines,
  normalizeUserArg,
  parseCommand,
} from "@/lib/admin/commands";
import type { CommandResult } from "@/lib/admin/commands";
import type { AdminUser, PlayerWallet } from "@/lib/economy/economy";
import { createClient } from "@/lib/supabase/server";

function label(user: AdminUser): string {
  return user.username ? `@${user.username}` : user.display_name;
}

function describe(user: AdminUser): string {
  return `${user.display_name} (${user.username ? "@" + user.username : "no handle"}) · ${user.role}${user.banned ? " · banned" : ""} · ◎${user.coins}`;
}

/** Execute one admin terminal command. Admin-gated server-side. */
export async function runAdminCommand(line: string): Promise<CommandResult> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { ok: false, lines: ["Not signed in."] };
  }
  const { data: wallet } = await supabase
    .rpc("get_player_wallet")
    .maybeSingle<PlayerWallet>();
  if (wallet?.role !== "admin") {
    return { ok: false, lines: ["Access denied. Admins only."] };
  }

  const cmd = parseCommand(line);
  if (!cmd) return { ok: true, lines: [] };

  async function resolveUser(
    arg: string | undefined,
  ): Promise<{ user?: AdminUser; error?: string[] }> {
    const query = normalizeUserArg(arg);
    if (!query) return { error: ["Specify a user (username, name, or id)."] };
    const { data, error } = await supabase.rpc("admin_find_user", {
      p_query: query,
    });
    if (error) return { error: ["Lookup failed."] };
    const users = (data ?? []) as AdminUser[];
    if (users.length === 0) return { error: [`No user matches "${query}".`] };
    if (users.length > 1) {
      return {
        error: [
          `Multiple matches for "${query}":`,
          ...users.map((u) => "  " + describe(u)),
          "Be more specific — use @username or an id.",
        ],
      };
    }
    return { user: users[0] };
  }

  switch (cmd.name) {
    case "help":
      return { ok: true, lines: helpLines() };

    case "clear":
      return { ok: true, lines: [] };

    case "give":
    case "take": {
      const { user, error } = await resolveUser(cmd.args[0]);
      if (!user) return { ok: false, lines: error ?? [] };
      const raw = Number(cmd.args[1]);
      if (!Number.isFinite(raw) || raw === 0) {
        return { ok: false, lines: [`Usage: /${cmd.name} <user> <amount>`] };
      }
      const amount =
        cmd.name === "take" ? -Math.abs(Math.trunc(raw)) : Math.trunc(raw);
      const { error: rpcError } = await supabase.rpc("admin_grant_coins", {
        p_user_id: user.id,
        p_amount: amount,
      });
      if (rpcError) return { ok: false, lines: ["Failed to update coins."] };
      const { data: after } = await supabase.rpc("admin_find_user", {
        p_query: user.id,
      });
      const balance = ((after ?? [])[0] as AdminUser | undefined)?.coins;
      return {
        ok: true,
        lines: [
          `${amount >= 0 ? "Gave" : "Took"} ${Math.abs(amount)} coins ${amount >= 0 ? "to" : "from"} ${label(user)}. Balance: ◎${balance ?? "?"}.`,
        ],
      };
    }

    case "giveall": {
      const amount = Math.trunc(Number(cmd.args[0]));
      if (!Number.isFinite(amount) || amount === 0) {
        return { ok: false, lines: ["Usage: /giveall <amount>"] };
      }
      const { data, error } = await supabase.rpc("admin_grant_coins_all", {
        p_amount: amount,
      });
      if (error) return { ok: false, lines: ["Failed."] };
      return {
        ok: true,
        lines: [`Adjusted ${data ?? 0} players by ${amount} coins.`],
      };
    }

    case "ban":
    case "unban": {
      const { user, error } = await resolveUser(cmd.args[0]);
      if (!user) return { ok: false, lines: error ?? [] };
      const banned = cmd.name === "ban";
      const { error: rpcError } = await supabase.rpc("admin_set_ban", {
        p_user_id: user.id,
        p_banned: banned,
      });
      if (rpcError) {
        return {
          ok: false,
          lines: [rpcError.code === "42501" ? "Can't ban an admin." : "Failed."],
        };
      }
      return { ok: true, lines: [`${banned ? "Banned" : "Unbanned"} ${label(user)}.`] };
    }

    case "grant": {
      const { user, error } = await resolveUser(cmd.args[0]);
      if (!user) return { ok: false, lines: error ?? [] };
      const code = (cmd.args[1] ?? "").toLowerCase();
      if (!code) return { ok: false, lines: ["Usage: /grant <user> <code>"] };
      const { data, error: rpcError } = await supabase.rpc(
        "admin_grant_cosmetic",
        { p_user_id: user.id, p_code: code },
      );
      if (rpcError) return { ok: false, lines: ["Failed."] };
      const granted = (data as number) ?? 0;
      return {
        ok: true,
        lines: [
          granted > 0
            ? `Granted ${granted} item(s) ("${code}") to ${label(user)}.`
            : `No new items for code "${code}" (unknown or already owned).`,
        ],
      };
    }

    case "promote":
    case "demote": {
      const { user, error } = await resolveUser(cmd.args[0]);
      if (!user) return { ok: false, lines: error ?? [] };
      const role = cmd.name === "promote" ? "admin" : "player";
      const { error: rpcError } = await supabase.rpc("admin_set_role", {
        p_user_id: user.id,
        p_role: role,
      });
      if (rpcError) return { ok: false, lines: ["Failed."] };
      return { ok: true, lines: [`${label(user)} is now ${role}.`] };
    }

    case "whois": {
      const { user, error } = await resolveUser(cmd.args[0]);
      if (!user) return { ok: false, lines: error ?? [] };
      return { ok: true, lines: [describe(user)] };
    }

    case "users": {
      const query = normalizeUserArg(cmd.args[0]);
      const rpc = query
        ? supabase.rpc("admin_find_user", { p_query: query })
        : supabase.rpc("admin_list_users");
      const { data, error } = await rpc;
      if (error) return { ok: false, lines: ["Failed."] };
      const users = (data ?? []) as AdminUser[];
      if (users.length === 0) {
        return { ok: true, lines: [query ? `No matches for "${query}".` : "No users."] };
      }
      return {
        ok: true,
        lines: [`${users.length} user(s):`, ...users.map((u) => "  " + describe(u))],
      };
    }

    case "stats": {
      const { data, error } = await supabase.rpc("admin_stats").maybeSingle<{
        total_users: number;
        admins: number;
        banned: number;
        total_coins: number;
      }>();
      if (error || !data) return { ok: false, lines: ["Failed."] };
      return {
        ok: true,
        lines: [
          `Users:   ${data.total_users}`,
          `Admins:  ${data.admins}`,
          `Banned:  ${data.banned}`,
          `Coins:   ◎${data.total_coins}`,
        ],
      };
    }

    default:
      return {
        ok: false,
        lines: [`Unknown command: ${cmd.name}. Type /help.`],
      };
  }
}
