import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testFileDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testFileDir, "..");
const projectRoot = resolve(packageRoot, "..", "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const testDir = join(tmpdir(), `import-pgn-test-${randomBytes(4).toString("hex")}`);

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const FIXTURE_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abc12345"]
[LichessURL "https://lichess.org/abc12345"]
[Date "2020.06.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]
[WhiteElo "2400"]
[BlackElo "2300"]
[ECO "C50"]
[Opening "Italian Game"]
[TimeControl "180+2"]
[Termination "Normal"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0

[Event "Rated Rapid game"]
[Site "https://lichess.org/def67890"]
[LichessURL "https://lichess.org/def67890"]
[Date "2020.07.15"]
[White "Player3"]
[Black "Player4"]
[Result "0-1"]
[WhiteElo "2100"]
[BlackElo "2200"]
[ECO "B50"]
[Opening "Sicilian Defense"]
[TimeControl "600+0"]
[Termination "Time forfeit"]

1. e4 c5 2. Nf3 d6 0-1

[Event "Rated Classical game"]
[Site "https://lichess.org/ghi11111"]
[LichessURL "https://lichess.org/ghi11111"]
[Date "2021.01.10"]
[White "Player5"]
[Black "Player6"]
[Result "1/2-1/2"]
[WhiteElo "2500"]
[BlackElo "2450"]
[ECO "A00"]
[Opening "Hungarian Opening"]
[TimeControl "1800+0"]
[Termination "Normal"]

1. g3 d5 2. Bg2 c6 1/2-1/2
`;

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeFixtureFile(contents: string): string {
  const filePath = join(testDir, `${randomBytes(4).toString("hex")}.pgn`);
  writeFileSync(filePath, contents, "utf-8");
  return filePath;
}

function createDbPath(): string {
  return join(testDir, "dbs", randomBytes(4).toString("hex"), "databases", "games.db");
}

function runCommand(args: string[], env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(pnpmBin, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

function runCliScript(cliArgs: string[], env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return runCommand(
    [
      "--filter",
      "@chess/api",
      "exec",
      "node",
      "--import",
      "tsx",
      "src/scripts/import-pgn.ts",
      ...cliArgs,
    ],
    env,
  );
}

function runPackageScript(cliArgs: string[], env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return runCommand(["--filter", "@chess/api", "import-pgn", ...cliArgs], env);
}

function openDb(dbPath: string): InstanceType<typeof Database> {
  return new Database(dbPath, { readonly: true });
}

describe("import-pgn CLI", () => {
  it("prints usage and exits with code 1 when no path is provided", async () => {
    const result = await runCliScript([]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage: import-pgn <path-to-pgn-file>");
  });

  it("prints a file-not-found error and exits with code 1", async () => {
    const missingPath = "databases/does-not-exist.pgn";
    const result = await runCliScript([missingPath]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Error: file not found: ${resolve(projectRoot, missingPath)}`);
  });

  it("bootstraps the schema, imports rows, maps fields, and skips duplicates on re-import", async () => {
    const filePath = writeFixtureFile(FIXTURE_PGN);
    const dbPath = createDbPath();

    expect(existsSync(dbPath)).toBe(false);

    const firstRun = await runCliScript([filePath], { GAMES_DB_PATH: dbPath });

    expect(firstRun.exitCode).toBe(0);
    expect(firstRun.stdout).toContain("Done. Imported 3 games");
    expect(firstRun.stdout).toContain("(0 duplicates skipped)");
    expect(existsSync(dbPath)).toBe(true);

    const sqlite = openDb(dbPath);
    const row = sqlite
      .prepare("SELECT * FROM database_games WHERE lichess_url = ?")
      .get("https://lichess.org/abc12345") as Record<string, unknown>;
    const indexes = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'database_games'",
      )
      .all() as Array<{ name: string }>;

    expect(row.white).toBe("Player1");
    expect(row.black).toBe("Player2");
    expect(row.white_elo).toBe(2400);
    expect(row.black_elo).toBe(2300);
    expect(row.result).toBe("1-0");
    expect(row.eco).toBe("C50");
    expect(row.opening).toBe("Italian Game");
    expect(row.date).toBe("2020.06.01");
    expect(row.time_control).toBe("180+2");
    expect(row.termination).toBe("Normal");
    expect(row.lichess_url).toBe("https://lichess.org/abc12345");
    expect(row.pgn).toContain('[Event "Rated Blitz game"]');
    expect(row.pgn).toContain("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0");
    expect(indexes.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "database_games_white_idx",
        "database_games_black_idx",
        "database_games_white_elo_idx",
        "database_games_black_elo_idx",
        "database_games_result_idx",
        "database_games_eco_idx",
        "database_games_date_idx",
      ]),
    );
    sqlite.close();

    const secondRun = await runCliScript([filePath], { GAMES_DB_PATH: dbPath });

    expect(secondRun.exitCode).toBe(0);
    expect(secondRun.stdout).toContain("Done. Imported 0 games");
    expect(secondRun.stdout).toContain("(3 duplicates skipped)");

    const sqliteAfterReimport = openDb(dbPath);
    const countRow = sqliteAfterReimport
      .prepare("SELECT COUNT(*) as count FROM database_games")
      .get() as {
      count: number;
    };

    expect(countRow.count).toBe(3);
    sqliteAfterReimport.close();
  }, 20_000);

  it("defaults missing optional fields, coerces invalid Elo values, and skips games without a URL", async () => {
    const mixedPgn = `[LichessURL "https://lichess.org/minimal"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 1-0

[LichessURL "https://lichess.org/elotest"]
[White "Carol"]
[Black "Dave"]
[Result "0-1"]
[WhiteElo "?"]
[BlackElo "2000"]

1. d4 d5 0-1

[Event "No URL Game"]
[White "Eve"]
[Black "Frank"]
[Result "1/2-1/2"]

1. c4 e5 1/2-1/2
`;
    const filePath = writeFixtureFile(mixedPgn);
    const dbPath = createDbPath();

    const result = await runCliScript([filePath], { GAMES_DB_PATH: dbPath });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Done. Imported 2 games");

    const sqlite = openDb(dbPath);
    const minimalRow = sqlite
      .prepare("SELECT * FROM database_games WHERE lichess_url = ?")
      .get("https://lichess.org/minimal") as Record<string, unknown>;
    const eloRow = sqlite
      .prepare("SELECT * FROM database_games WHERE lichess_url = ?")
      .get("https://lichess.org/elotest") as Record<string, unknown>;
    const countRow = sqlite.prepare("SELECT COUNT(*) as count FROM database_games").get() as {
      count: number;
    };

    expect(minimalRow.white_elo).toBe(0);
    expect(minimalRow.black_elo).toBe(0);
    expect(minimalRow.eco).toBeNull();
    expect(minimalRow.opening).toBeNull();
    expect(minimalRow.date).toBeNull();
    expect(minimalRow.time_control).toBeNull();
    expect(minimalRow.termination).toBeNull();
    expect(eloRow.white_elo).toBe(0);
    expect(eloRow.black_elo).toBe(2000);
    expect(countRow.count).toBe(2);
    sqlite.close();
  }, 20_000);

  it("logs progress after processing 10000 games", async () => {
    const bigFixture = Array.from({ length: 10_000 }, (_, index) => {
      return `[LichessURL "https://lichess.org/batch${index}"]
[White "W${index}"]
[Black "B${index}"]
[Result "1-0"]

1. e4 1-0
`;
    }).join("\n");
    const filePath = writeFixtureFile(bigFixture);
    const dbPath = createDbPath();

    const result = await runCliScript([filePath], { GAMES_DB_PATH: dbPath });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Processed 10000 games");
    expect(result.stdout).toContain("Done. Imported 10000 games");
  }, 30_000);

  it("runs through the package script entry with a project-root-relative path", async () => {
    const filePath = writeFixtureFile(FIXTURE_PGN);
    const dbPath = createDbPath();
    const relativePath = relative(projectRoot, filePath);

    const result = await runPackageScript([relativePath], { GAMES_DB_PATH: dbPath });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Done. Imported 3 games");

    const sqlite = openDb(dbPath);
    const countRow = sqlite.prepare("SELECT COUNT(*) as count FROM database_games").get() as {
      count: number;
    };

    expect(countRow.count).toBe(3);
    sqlite.close();
  }, 20_000);
});
