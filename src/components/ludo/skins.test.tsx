import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

import { Dice } from "./dice";
import { LudoBoard } from "./ludo-board";

describe("board and dice skins", () => {
  it("applies board and token skin data attributes", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        boardSkin="emerald"
        tokenSkin="gem"
      />,
    );
    expect(
      container.querySelector('[data-board-skin="emerald"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-token-skin="gem"]')).not.toBeNull();
  });

  it("applies an in-game background skin", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        backgroundSkin="hidden_leaf"
      />,
    );

    expect(
      container.querySelector('[data-background-skin="hidden_leaf"]'),
    ).not.toBeNull();
  });

  it("keeps an obvious team-color tint on styled tokens", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        tokenSkin="straw_hat"
      />,
    );

    expect(container.querySelector('[data-team-color="red"]')).not.toBeNull();
    expect(container.querySelector('[data-team-color="green"]')).not.toBeNull();
  });

  it("marks every rendered token with the equipped token skin", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        tokenSkin="ninja"
      />,
    );

    const tokens = container.querySelectorAll('button[data-token-skin="ninja"]');
    expect(tokens).toHaveLength(match.tokens.length);
  });

  it("renders every token in the flat token form, including classic", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
      />,
    );

    expect(container.querySelectorAll('[data-token-form="flat"]')).toHaveLength(
      match.tokens.length,
    );
  });

  it("marks every token with its visible seat-color fill", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        tokenSkin="straw_hat"
      />,
    );

    for (const color of ["red", "green"] as const) {
      expect(
        container.querySelectorAll(`[data-token-seat-fill="${color}"]`),
      ).toHaveLength(4);
    }
    expect(container.querySelectorAll("[data-token-color-plate]")).toHaveLength(
      match.tokens.length,
    );
    expect(container.querySelectorAll("[data-token-contrast-ring]")).toHaveLength(
      match.tokens.length,
    );
  });

  it("renders ninja tokens with headband details", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        tokenSkin="ninja"
      />,
    );

    expect(container.querySelectorAll('[data-token-detail="headband"]')).toHaveLength(
      match.tokens.length,
    );
    expect(container.querySelectorAll("[data-token-rivets]")).toHaveLength(
      match.tokens.length,
    );
  });

  it("renders straw hat tokens with a skull-and-bones emblem", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        tokenSkin="straw_hat"
      />,
    );

    expect(
      container.querySelectorAll('[data-token-emblem="straw-crossbones"]'),
    ).toHaveLength(match.tokens.length);
  });

  it("renders a visible skin mark for non-classic token skins", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        tokenSkin="straw_hat"
      />,
    );

    expect(container.querySelectorAll("[data-token-skin-mark]")).toHaveLength(
      match.tokens.length,
    );
  });

  it("renders skin shapes with seat-colored overlays", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        tokenSkin="crystal"
      />,
    );

    expect(container.querySelectorAll("[data-token-skin-shape]")).toHaveLength(
      match.tokens.length,
    );
    expect(container.querySelectorAll("[data-token-team-overlay]")).toHaveLength(
      match.tokens.length,
    );
    expect(
      container.querySelector('[data-token-skin="crystal"] [data-team-color="red"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-token-skin="crystal"] [data-team-color="green"]',
      ),
    ).not.toBeNull();
  });

  it("defaults to the classic board skin", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
      />,
    );
    expect(
      container.querySelector('[data-board-skin="classic"]'),
    ).not.toBeNull();
  });

  it("applies the animation pack to the board", () => {
    const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
    const { container } = render(
      <LudoBoard
        match={match}
        movableTokenIds={new Set()}
        animatingTokenId={null}
        animatingCell={null}
        capturedTokenIds={new Set()}
        interactive={false}
        onTokenClick={() => {}}
        animationSkin="dynamic"
      />,
    );
    expect(container.querySelector('[data-animation="dynamic"]')).not.toBeNull();
  });

  it("applies the dice skin and roll animation", () => {
    render(
      <Dice
        value={6}
        rolling={false}
        ready
        disabled={false}
        onRoll={() => {}}
        skin="onyx"
        animation="dynamic"
      />,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("data-dice-skin")).toBe("onyx");
    expect(button.getAttribute("data-roll-animation")).toBe("dynamic");
  });
});
