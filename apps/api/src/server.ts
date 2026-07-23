import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const config = loadConfig();
  const app = createApp(config);

  app.listen(config.port, () => {
    console.log(`x402 server listening on http://localhost:${config.port}`);
    console.log(`Paid endpoint: GET /api/costly-data (${config.price} USDC)`);
    console.log(`Network: ${config.network}`);
    console.log(`Receiving wallet: ${config.payTo}`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
