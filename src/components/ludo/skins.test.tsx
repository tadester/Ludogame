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
