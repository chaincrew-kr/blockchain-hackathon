export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;
export const SOLANA_MAINNET =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;

export type SolanaNetwork = typeof SOLANA_DEVNET | typeof SOLANA_MAINNET;

export interface AppConfig {
  facilitatorUrl: string;
  network: SolanaNetwork;
  payTo: string;
  port: number;
  price: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const payTo = env.SVM_ADDRESS?.trim();
  if (!payTo || payTo.startsWith("replace_")) {
    throw new Error(
      "SVM_ADDRESS is required. Copy .env.example to .env and add a Solana receiving address.",
    );
  }

  const network = env.X402_NETWORK?.trim() || SOLANA_DEVNET;
  if (network !== SOLANA_DEVNET && network !== SOLANA_MAINNET) {
    throw new Error(
      `Unsupported X402_NETWORK: ${network}. Use a Solana devnet or mainnet CAIP-2 identifier.`,
    );
  }

  const port = Number(env.PORT ?? 4021);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const price = env.PAYMENT_PRICE?.trim() || "$0.001";
  if (!/^\$\d+(?:\.\d{1,6})?$/.test(price)) {
    throw new Error(
      'PAYMENT_PRICE must be a USDC amount such as "$0.001" (up to 6 decimals).',
    );
  }

  return {
    facilitatorUrl:
      env.FACILITATOR_URL?.trim() || "https://x402.org/facilitator",
    network,
    payTo,
    port,
    price,
  };
}
