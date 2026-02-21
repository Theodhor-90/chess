import type { Page } from "@playwright/test";

let counter = 0;

/**
 * Generates a unique email address for each test invocation.
 * Uses a combination of Date.now() and an incrementing counter to guarantee
 * uniqueness even when called multiple times within the same millisecond.
 */
export function uniqueEmail(): string {
  counter++;
  return `test-${Date.now()}-${counter}@example.com`;
}

/**
 * Fills out the registration form and submits it.
 * Navigates to /register, fills the email and password fields, clicks submit,
 * and waits for the URL to change away from /register (indicating success).
 */
export async function registerUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/register");
  await page.locator('input[id="email"]').fill(email);
  await page.locator('input[id="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  // Wait for navigation away from /register (success redirects to / or redirect param)
  await page.waitForURL((url) => !url.pathname.startsWith("/register"));
}

/**
 * Fills out the login form and submits it.
 * Navigates to /login, fills the email and password fields, clicks submit,
 * and waits for the URL to change away from /login (indicating success).
 */
export async function loginUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[id="email"]').fill(email);
  await page.locator('input[id="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  // Wait for navigation away from /login (success redirects to / or redirect param)
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * Moves a piece on the Chessground board by clicking the source square,
 * then clicking the destination square (click-click mode).
 *
 * Chessground positions pieces using CSS transforms with percentage-based
 * coordinates. The board container is set to 400x400 pixels in GameBoard.tsx.
 * Each square is 1/8 of the board size.
 *
 * Orientation is detected from the game-board element's own class list.
 * Chessground adds "orientation-black"/"orientation-white" directly to the
 * element passed to Chessground() (wrap.js lines 22-24), which is the
 * div[data-testid="game-board"].
 */
export async function movePiece(page: Page, from: string, to: string): Promise<void> {
  const board = page.locator('[data-testid="game-board"] cg-board');
  const boardBox = await board.boundingBox();
  if (!boardBox) throw new Error("Board not found or not visible");

  const isBlack = await page
    .locator('[data-testid="game-board"]')
    .evaluate((el) => el.classList.contains("orientation-black"));

  function squareToPixel(square: string): { x: number; y: number } {
    const file = square.charCodeAt(0) - "a".charCodeAt(0); // 0-7 (a=0, h=7)
    const rank = parseInt(square[1], 10) - 1; // 0-7 (1=0, 8=7)
    const squareSize = boardBox.width / 8;
    const halfSquare = squareSize / 2;

    let pixelX: number;
    let pixelY: number;

    if (isBlack) {
      // Black orientation: a-file on the right, rank 1 at top
      pixelX = boardBox.x + (7 - file) * squareSize + halfSquare;
      pixelY = boardBox.y + rank * squareSize + halfSquare;
    } else {
      // White orientation: a-file on the left, rank 1 at bottom
      pixelX = boardBox.x + file * squareSize + halfSquare;
      pixelY = boardBox.y + (7 - rank) * squareSize + halfSquare;
    }

    return { x: pixelX, y: pixelY };
  }

  const fromPos = squareToPixel(from);
  const toPos = squareToPixel(to);

  // Click source square to select the piece, then click destination to move
  await page.mouse.click(fromPos.x, fromPos.y);
  await page.mouse.click(toPos.x, toPos.y);
}

/**
 * Waits until it's the specified color's turn by checking the game status
 * text in the GamePage side panel. GamePage.tsx renders "{currentTurn}'s turn"
 * when the game is active. We use status text rather than Chessground CSS
 * classes because "manipulable" reflects viewOnly state, not whose turn it is.
 */
export async function waitForTurn(page: Page, color: "white" | "black"): Promise<void> {
  // Use "attached" instead of "visible" because on mobile viewports the side
  // panel with the turn indicator may be off-screen (horizontal flex layout).
  await page.getByText(`${color}'s turn`).waitFor({ state: "attached", timeout: 10_000 });
}
