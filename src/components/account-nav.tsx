import Link from "next/link";

const accountLinks = [
  { href: "/", label: "Play" },
  { href: "/friends", label: "Friends" },
  { href: "/customize", label: "Customize" },
  { href: "/profile", label: "Profile" },
] as const;

export function AccountNav() {
  return (
    <nav aria-label="Account" className="account-nav">
      <div className="account-links">
        {accountLinks.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
      <form action="/auth/signout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </nav>
  );
}
