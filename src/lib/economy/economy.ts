import type { CosmeticKind } from "@/lib/cosmetics/cosmetics";

export type AppRole = "player" | "admin";

/** Developer accounts that are always treated as admins, even before the
 *  database role backfill has run. Keep in sync with the SQL bootstrap. */
export const DEV_EMAILS: readonly string[] = ["obasantade@gmail.com"];

export function isDevEmail(email: string | null | undefined): boolean {
  return !!email && DEV_EMAILS.includes(email.trim().toLowerCase());
}

export interface PlayerWallet {
  readonly coins: number;
  readonly role: AppRole;
  readonly banned: boolean;
}

export interface StoreItem {
  readonly id: string;
  readonly kind: CosmeticKind;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly is_default: boolean;
  readonly owned: boolean;
}

export interface PowerStoreItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly is_default: boolean;
  readonly owned: boolean;
}

export interface AdminUser {
  readonly id: string;
  readonly username: string | null;
  readonly display_name: string;
  readonly role: AppRole;
  readonly coins: number;
  readonly banned: boolean;
}

/** Format a coin amount with thousands separators. */
export function formatCoins(amount: number): string {
  return amount.toLocaleString("en-US");
}

export function isAdmin(wallet: PlayerWallet | null | undefined): boolean {
  return wallet?.role === "admin";
}

export function canAfford(
  wallet: PlayerWallet | null | undefined,
  price: number,
): boolean {
  return !!wallet && wallet.coins >= price;
}

/** Whether the buy button should be shown for a store item. */
export function isPurchasable(
  item: StoreItem,
  wallet: PlayerWallet | null | undefined,
): boolean {
  return !item.owned && !item.is_default && canAfford(wallet, item.price);
}
