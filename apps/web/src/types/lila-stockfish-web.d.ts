declare module "lila-stockfish-web/sf16-7.js" {
  import type StockfishWeb from "lila-stockfish-web";
  const factory: () => Promise<StockfishWeb>;
  export default factory;
}
