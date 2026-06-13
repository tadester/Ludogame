import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Classic and Nigerian rules</p>
        <h1>Choose how to play</h1>
        <p className="hero-copy">
          Pass-the-phone matches are ready to play. Online friend rooms arrive
          in a later section.
        </p>
      </section>
      <section className="play-grid" aria-label="Play types">
        <article className="play-card">
          <h2>Pass the phone</h2>
          <p>Play locally with two to four players on one device.</p>
          <Link className="primary-button" href="/play">
            Pass the phone
          </Link>
        </article>
        <article className="play-card">
          <h2>Friend room</h2>
          <p>Invite friends to a private online match.</p>
          <button type="button" disabled>
            Friend room
          </button>
        </article>
      </section>
    </>
  );
}
