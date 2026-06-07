import { AppShell } from "@/components/app-shell";

const playTypes = [
  {
    name: "Friend room",
    description: "Invite friends to a private online match.",
  },
  {
    name: "Pass the phone",
    description: "Play locally with temporary player names.",
  },
] as const;

export default function Home() {
  return (
    <AppShell>
      <section className="hero">
        <p className="eyebrow">Classic and Nigerian rules</p>
        <h1>Choose how to play</h1>
        <p className="hero-copy">
          The game foundation is ready. Account and match setup arrive in the
          next sections.
        </p>
      </section>
      <section className="play-grid" aria-label="Play types">
        {playTypes.map((playType) => (
          <article className="play-card" key={playType.name}>
            <h2>{playType.name}</h2>
            <p>{playType.description}</p>
            <button type="button" disabled>
              {playType.name}
            </button>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
