import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setupLocalMatch } from "@/lib/ludo-ui/local-game";

import { Dice } from "./dice";
import { LudoBoard } from "./ludo-board";

function renderBoard(props: Partial<Parameters<typeof LudoBoard>[0]> = {}) {
  const match = setupLocalMatch([{ name: "A" }, { name: "B" }]);
  const result = render(
    <LudoBoard
      match={match}
      movableTokenIds={new Set()}
      animatingTokenId={null}
      animatingCell={null}
      capturedTokenIds={new Set()}
      interactive={false}
      onTokenClick={() => {}}
      {...props}
    />,
  );
  return { match, ...result };
}

describe("board and dice skins", () => {
  it("applies board and token skin data attributes", () => {
    const { container } = renderBoard({ boardSkin: "emerald", tokenSkin: "gem" });
    expect(container.querySelector('[data-board-skin="emerald"]')).not.toBeNull();
    expect(container.querySelector('[data-token-skin="gem"]')).not.toBeNull();
  });

  it("applies an in-game background skin", () => {
    const { container } = renderBoard({ backgroundSkin: "hidden_leaf" });
    expect(
      container.querySelector('[data-background-skin="hidden_leaf"]'),
    ).not.toBeNull();
  });

  it("gives every token a team-coloured piece, whatever the skin", () => {
    const { container } = renderBoard({ tokenSkin: "ninja" });
    expect(container.querySelector('[data-team-color="red"]')).not.toBeNull();
    expect(container.querySelector('[data-team-color="green"]')).not.toBeNull();
  });

  it("renders one team-coloured piece per token under the equipped skin", () => {
    const { container, match } = renderBoard({ tokenSkin: "straw_hat" });
    const pieces = container.querySelectorAll(
      '[data-token-skin="straw_hat"] [data-team-color]',
    );
    expect(pieces).toHaveLength(match.tokens.length);
  });

  it("defaults to the classic board skin", () => {
    const { container } = renderBoard();
    expect(container.querySelector('[data-board-skin="classic"]')).not.toBeNull();
  });

  it("applies the animation pack to the board", () => {
    const { container } = renderBoard({ animationSkin: "dynamic" });
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
