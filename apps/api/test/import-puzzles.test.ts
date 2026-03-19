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
const testDir = join(tmpdir(), `import-puzzles-test-${randomBytes(4).toString("hex")}`);

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const HEADER =
  "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags";

const FIXTURE_CSV = `${HEADER}
00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1852,74,97,3567,crushing hangingPiece long middlegame,https://lichess.org/787zsVup/black#48,Italian_Game Italian_Game_Classical_Variation
000aY,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f6e7 d6d7 e7f8,1575,73,98,6277,advantage endgame short,https://lichess.org/kiuvTFoE#53,
000ba,r2qr1k1/ppp2pp1/3p3p/8/4PQ1b/2NB4/PPP2PPP/R4RK1 w - - 3 16,f4f7 e8e4 f7f6 e4e1,1862,76,98,4210,advantage middlegame short,https://lichess.org/s1M0KyyX#31,Sicilian_Defense Sicilian_Defense_Najdorf_Variation
`;

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeFixtureFile(contents: string): string {
  const filePath = join(testDir, `${randomBytes(4).toString("hex")}.csv`);
  writeFileSync(filePath, contents, "utf-8");
  return filePath;
}

function createDbPath(): string {
  return join(testDir, "dbs", randomBytes(4).toString("hex"), "data", "chess.db");
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
      "src/scripts/import-puzzles.ts",
      ...cliArgs,
    ],
    env,
  );
}

function runPackageScript(cliArgs: string[], env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  return runCommand(["--filter", "@chess/api", "import-puzzles", ...cliArgs], env);
}

function openDb(dbPath: string): InstanceType<typeof Database> {
  return new Database(dbPath, { readonly: true });
}

describe("import-puzzles CLI", () => {
  it("prints usage and exits with code 1 when no path is provided", async () => {
    const result = await runCliScript([]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Usage: import-puzzles <path-to-csv-file>");
  });

  it("prints a file-not-found error and exits with code 1", async () => {
    const missingPath = "data/does-not-exist.csv";
    const result = await runCliScript([missingPath]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Error: file not found: ${resolve(projectRoot, missingPath)}`);
  });

  it("bootstraps the schema, imports rows, maps fields, and skips duplicates on re-import", async () => {
    const filePath = writeFixtureFile(FIXTURE_CSV);
    const dbPath = createDbPath();

    expect(existsSync(dbPath)).toBe(false);

    const firstRun = await runCliScript([filePath], { DATABASE_URL: dbPath });

    expect(firstRun.exitCode).toBe(0);
    expect(firstRun.stdout).toContain("Done. Imported 3 puzzles");
    expect(firstRun.stdout).toContain("(0 duplicates skipped)");
    expect(existsSync(dbPath)).toBe(true);

    const sqlite = openDb(dbPath);
    const row = sqlite.prepare("SELECT * FROM puzzles WHERE puzzle_id = ?").get("00008") as Record<
      string,
      unknown
    >;
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'puzzles'")
      .all() as Array<{ name: string }>;

    expect(row.puzzle_id).toBe("00008");
    expect(row.fen).toBe("r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24");
    expect(row.moves).toBe("f2g3 e6e7 b2b1 b3c1 b1c1 h6c1");
    expect(row.rating).toBe(1852);
    expect(row.rating_deviation).toBe(74);
    expect(row.popularity).toBe(97);
    expect(row.nb_plays).toBe(3567);
    expect(row.themes).toBe("crushing hangingPiece long middlegame");
    expect(row.game_url).toBe("https://lichess.org/787zsVup/black#48");
    expect(row.opening_tags).toBe("Italian_Game Italian_Game_Classical_Variation");
    expect(indexes.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "puzzles_rating_idx",
        "puzzles_popularity_idx",
        "puzzles_themes_idx",
      ]),
    );
    sqlite.close();

    // Re-import: all should be duplicates
    const secondRun = await runCliScript([filePath], { DATABASE_URL: dbPath });

    expect(secondRun.exitCode).toBe(0);
    expect(secondRun.stdout).toContain("Done. Imported 0 puzzles");
    expect(secondRun.stdout).toContain("(3 duplicates skipped)");

    const sqliteAfterReimport = openDb(dbPath);
    const countRow = sqliteAfterReimport.prepare("SELECT COUNT(*) as count FROM puzzles").get() as {
      count: number;
    };

    expect(countRow.count).toBe(3);
    sqliteAfterReimport.close();
  }, 20_000);

  it("handles null openingTags correctly", async () => {
    const filePath = writeFixtureFile(FIXTURE_CSV);
    const dbPath = createDbPath();

    await runCliScript([filePath], { DATABASE_URL: dbPath });

    const sqlite = openDb(dbPath);
    const rowWithTags = sqlite
      .prepare("SELECT opening_tags FROM puzzles WHERE puzzle_id = ?")
      .get("00008") as Record<string, unknown>;
    const rowWithoutTags = sqlite
      .prepare("SELECT opening_tags FROM puzzles WHERE puzzle_id = ?")
      .get("000aY") as Record<string, unknown>;

    expect(rowWithTags.opening_tags).toBe("Italian_Game Italian_Game_Classical_Variation");
    expect(rowWithoutTags.opening_tags).toBeNull();
    sqlite.close();
  }, 20_000);

  it("runs through the package script entry with a project-root-relative path", async () => {
    const filePath = writeFixtureFile(FIXTURE_CSV);
    const dbPath = createDbPath();
    const relativePath = relative(projectRoot, filePath);

    const result = await runPackageScript([relativePath], { DATABASE_URL: dbPath });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Done. Imported 3 puzzles");

    const sqlite = openDb(dbPath);
    const countRow = sqlite.prepare("SELECT COUNT(*) as count FROM puzzles").get() as {
      count: number;
    };

    expect(countRow.count).toBe(3);
    sqlite.close();
  }, 20_000);
});
