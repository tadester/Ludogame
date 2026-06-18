import Link from "next/link";

import { formatCoins } from "@/lib/economy/economy";

const baseLinks = [
  { href: "/", label: "Play" },
  { href: "/friends", label: "Friends" },
  { href: "/store", label: "Store" },
  { href: "/customize", label: "Inventory" },
  { href: "/strategy", label: "Strategy" },
  { href: "/profile", label: "Profile" },
] as const;

type AccountNavProps = {
  coins?: number;
  isAdmin?: boolean;
};

export function AccountNav({ coins, isAdmin = false }: AccountNavProps) {
  return (
    <nav aria-label="Account" className="account-nav">
      <div className="account-links">
        {baseLinks.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
        {isAdmin ? <Link href="/admin">Admin</Link> : null}
      </div>
      <div className="account-meta">
        {typeof coins === "number" ? (
          <span className="coin-pill" aria-label="Coin balance">
            <span aria-hidden="true">◎</span> {formatCoins(coins)}
          </span>
        ) : null}
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
