import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

async function main(): Promise<void> {
  const baseUrl = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
  const response = await fetch(`${baseUrl}/api/costly-data`);

  console.log(`HTTP ${response.status} ${response.statusText}`);
  console.log("payment-required:", response.headers.get("payment-required"));
  console.log("body:", await response.text());

  if (response.status !== 402) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
