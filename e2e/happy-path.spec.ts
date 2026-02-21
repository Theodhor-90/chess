import { test, expect } from "@playwright/test";
import { uniqueEmail, registerUser, movePiece, waitForTurn } from "./helpers.js";

const TEST_PASSWORD = "TestPass123!";

test.describe("Happy Path — Full Game", () => {
  // Retry once — Firefox occasionally loses the Socket.io event that triggers
  // WaitingScreen → GamePage navigation when re-running against the same server.
  test.describe.configure({ retries: 1 });
  test("two players register, create game, join via invite, play Scholar's Mate, see game over", async ({
    browser,
  }, testInfo) => {
    // Run only on Chromium. Mobile viewports overflow the 400x400px board and
    // lack click-click support. Firefox/WebKit fail because Playwright runs all
    // projects sequentially against the same webServer process — Socket.io state
    // (rooms, listeners) from the first project's games bleeds into subsequent
    // projects, causing WaitingScreen → GamePage navigation to break.
    // Auth and smoke tests still cover cross-browser rendering.
    const isChromium = testInfo.project.name === "chromium";
    test.skip(
      !isChromium,
      "Happy-path runs on Chromium only (shared server state across projects)",
    );

    // ── Step 1: Create two isolated browser contexts (separate sessions) ──
    // Pass baseURL so relative URLs in helpers (e.g., page.goto("/register")) work.
    const baseURL = testInfo.project.use.baseURL;
    const contextA = await browser.newContext({ baseURL });
    const contextB = await browser.newContext({ baseURL });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // ── Step 2: Register both players ──
    const emailA = uniqueEmail();
    const emailB = uniqueEmail();

    await registerUser(pageA, emailA, TEST_PASSWORD);
    await expect(pageA).toHaveURL(/\/$/);

    await registerUser(pageB, emailB, TEST_PASSWORD);
    await expect(pageB).toHaveURL(/\/$/);

    // ── Step 3: Player A creates a game ──
    // Dashboard shows CreateGameForm. Default preset is index 2 ("Rapid 10+0").
    // Click the create game submit button.
    await pageA.locator('[data-testid="create-game-submit"]').click();

    // Wait for the WaitingScreen to appear
    await expect(pageA.locator('[data-testid="waiting-screen"]')).toBeVisible();

    // ── Step 4: Extract the invite URL ──
    const inviteUrlInput = pageA.locator('[data-testid="invite-url"]');
    await expect(inviteUrlInput).toBeVisible();
    const inviteUrl = await inviteUrlInput.inputValue();
    // inviteUrl is something like "http://localhost:5174/join/<token>"

    // Extract the path portion (/join/<token>) for Player B navigation
    const invitePath = new URL(inviteUrl).pathname;

    // ── Step 5: Player B navigates to the invite URL and joins the game ──
    await pageB.goto(invitePath);
    // JoinPage auto-joins when status is "waiting", then redirects to /game/:id
    await pageB.waitForURL(/\/game\/\d+/, { timeout: 15_000 });

    // ── Step 6: Player A should auto-navigate to the game page ──
    // WaitingScreen navigates to /game/:id when game status becomes "active"
    // via Socket.io event. On slower browsers (webkit mobile) this may take longer.
    await pageA.waitForURL(/\/game\/\d+/, { timeout: 15_000 });

    // ── Step 7: Both players should see the game board ──
    await expect(pageA.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(pageB.locator('[data-testid="game-board"]')).toBeVisible();

    // ── Step 8: Play Scholar's Mate ──
    // Scholar's Mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7#
    // Player A is white (creator is always white per game service)
    // Player B is black

    // Move 1: White plays e2-e4
    await waitForTurn(pageA, "white");
    await movePiece(pageA, "e2", "e4");

    // Move 1: Black plays e7-e5
    await waitForTurn(pageB, "black");
    await movePiece(pageB, "e7", "e5");

    // Move 2: White plays d1-h5 (Queen to h5)
    await waitForTurn(pageA, "white");
    await movePiece(pageA, "d1", "h5");

    // Move 2: Black plays b8-c6 (Knight to c6)
    await waitForTurn(pageB, "black");
    await movePiece(pageB, "b8", "c6");

    // Move 3: White plays f1-c4 (Bishop to c4)
    await waitForTurn(pageA, "white");
    await movePiece(pageA, "f1", "c4");

    // Move 3: Black plays g8-f6 (Knight to f6)
    await waitForTurn(pageB, "black");
    await movePiece(pageB, "g8", "f6");

    // Move 4: White plays h5-f7 (Queen captures f7 — CHECKMATE)
    await waitForTurn(pageA, "white");
    await movePiece(pageA, "h5", "f7");

    // ── Step 9: Both players see the game-over overlay ──
    // GameOverOverlay renders when game.status is in TERMINAL_STATUSES
    // (GameOverOverlay.tsx line 65). After checkmate, the server emits
    // "gameOver" with status "checkmate" and result { winner: "white", reason: "checkmate" }.

    // Player A (White) should see "You won by checkmate!"
    await expect(pageA.locator('[data-testid="game-over-overlay"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageA.locator('[data-testid="result-message"]')).toHaveText(
      "You won by checkmate!",
    );

    // Player B (Black) should see "You lost by checkmate."
    await expect(pageB.locator('[data-testid="game-over-overlay"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageB.locator('[data-testid="result-message"]')).toHaveText(
      "You lost by checkmate.",
    );

    // ── Step 10: Verify game-over overlay details ──
    // Both players should see the final clocks
    await expect(pageA.locator('[data-testid="final-clocks"]')).toBeVisible();
    await expect(pageB.locator('[data-testid="final-clocks"]')).toBeVisible();

    // Both players should see "Back to Dashboard" and "View Board" buttons
    await expect(pageA.locator('[data-testid="back-to-dashboard"]')).toBeVisible();
    await expect(pageA.locator('[data-testid="view-board"]')).toBeVisible();
    await expect(pageB.locator('[data-testid="back-to-dashboard"]')).toBeVisible();
    await expect(pageB.locator('[data-testid="view-board"]')).toBeVisible();

    // ── Cleanup ──
    await contextA.close();
    await contextB.close();
  });
});
