import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";

loadEnv({ path: new URL("../../../.env", import.meta.url), quiet: true });

async function loadBuyerKeypair(): Promise<Uint8Array> {
  const keypairPath = process.env.SVM_KEYPAIR_PATH?.trim();
  if (keypairPath) {
    const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const json = await readFile(resolve(repositoryRoot, keypairPath), "utf8");
    const bytes: unknown = JSON.parse(json);

    if (
      !Array.isArray(bytes) ||
      bytes.length !== 64 ||
      !bytes.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255,
      )
    ) {
      throw new Error(
        "SVM_KEYPAIR_PATH must point to a 64-byte Solana CLI keypair JSON file.",
      );
    }

    return Uint8Array.from(bytes);
  }

  const privateKey = process.env.SVM_PRIVATE_KEY?.trim();
  if (privateKey) {
    return base58.decode(privateKey);
  }

  throw new Error(
    "Set SVM_KEYPAIR_PATH to .secrets/buyer-devnet.json before running the client.",
  );
}

async function main(): Promise<void> {
  const signer = await createKeyPairSignerFromBytes(await loadBuyerKeypair());
  const client = new x402Client().register(
    "solana:*",
    new ExactSvmScheme(signer),
  );
  const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, client);
  const baseUrl = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";

  console.log(`Buyer wallet: ${signer.address}`);
  console.log(`Requesting ${baseUrl}/api/costly-data`);

  const response = await fetchWithPayment(`${baseUrl}/api/costly-data`);
  const body: unknown = await response.json();
  const settlement = new x402HTTPClient(client).getPaymentSettleResponse(
    (name) => response.headers.get(name),
  );

  console.log("Response:", JSON.stringify(body, null, 2));
  console.log("Settlement:", JSON.stringify(settlement, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
