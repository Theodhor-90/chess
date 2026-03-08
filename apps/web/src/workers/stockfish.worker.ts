import StockfishWeb from "lila-stockfish-web/sf16-7.js";

let engine: { uci: (cmd: string) => void } | null = null;

async function init(): Promise<void> {
  try {
    const sf = await StockfishWeb();

    engine = sf;

    let handshakePhase: "uci" | "isready" | "done" = "uci";

    sf.listen = (line: string) => {
      self.postMessage({ type: "uci-output", data: line });

      if (handshakePhase === "uci" && line === "uciok") {
        handshakePhase = "isready";
        sf.uci("isready");
      } else if (handshakePhase === "isready" && line === "readyok") {
        handshakePhase = "done";
        self.postMessage({ type: "ready" });
      }
    };

    sf.onError = (msg: string) => {
      self.postMessage({ type: "error", message: msg });
    };

    sf.uci("uci");
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Failed to initialize Stockfish",
    });
  }
}

self.onmessage = (e: MessageEvent<{ type: string; command: string }>) => {
  if (e.data.type === "uci-command" && engine) {
    engine.uci(e.data.command);
  }
};

init();
