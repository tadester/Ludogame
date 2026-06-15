import type { SupabaseClient } from "@supabase/supabase-js";

import type { DomainEvent, MatchState } from "@/lib/ludo";

import { VersionConflictError } from "./match-service";
import type { MatchStore, StoredMatch } from "./match-service";

interface MatchRow {
  id: string;
  version: number;
  snapshot: MatchState;
}

function toStored(row: MatchRow): StoredMatch {
  return { id: row.id, version: row.version, snapshot: row.snapshot };
}

/** Back the {@link MatchStore} with the service-role Supabase client and the
 *  atomic match RPCs. Pass a client created by `createServiceClient`. */
export function createSupabaseMatchStore(
  service: SupabaseClient,
): MatchStore {
  return {
    async loadByRoom(roomId) {
      const { data, error } = await service
        .from("matches")
        .select("id, version, snapshot")
        .eq("room_id", roomId)
        .maybeSingle<MatchRow>();
      if (error) throw new Error(error.message);
      return data ? toStored(data) : null;
    },

    async load(matchId) {
      const { data, error } = await service
        .from("matches")
        .select("id, version, snapshot")
        .eq("id", matchId)
        .maybeSingle<MatchRow>();
      if (error) throw new Error(error.message);
      return data ? toStored(data) : null;
    },

    async create(roomId, snapshot) {
      const { data, error } = await service
        .rpc("create_match_record", {
          p_room_id: roomId,
          p_snapshot: snapshot,
        })
        .single<MatchRow>();
      if (error || !data) {
        throw new Error(error?.message ?? "Unable to create the match.");
      }
      return toStored(data);
    },

    async commit(
      matchId: string,
      expectedVersion: number,
      snapshot: MatchState,
      events: readonly DomainEvent[],
    ) {
      const { data, error } = await service.rpc("commit_match_action", {
        p_match_id: matchId,
        p_expected_version: expectedVersion,
        p_snapshot: snapshot,
        p_events: events,
      });
      if (error) {
        if (error.code === "40001") throw new VersionConflictError();
        throw new Error(error.message);
      }
      return data as number;
    },
  };
}
