import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";
import { randomBytes, webcrypto } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const secretsDirectoryUrl = new URL("../../../.secrets/", import.meta.url);
const keypairUrl = new URL("buyer-devnet.json", secretsDirectoryUrl);

async function main(): Promise<void> {
  const privateKeyBytes = randomBytes(32);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    privateKeyBytes,
    true,
  );
  const publicKeyBytes = new Uint8Array(
    await webcrypto.subtle.exportKey("raw", signer.keyPair.publicKey),
  );
  const keypairBytes = new Uint8Array(64);
  keypairBytes.set(privateKeyBytes, 0);
  keypairBytes.set(publicKeyBytes, 32);

  await mkdir(secretsDirectoryUrl, { recursive: true });
  try {
    await writeFile(keypairUrl, JSON.stringify(Array.from(keypairBytes)), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(
        "buyer-devnet.json already exists. It was not overwritten.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    privateKeyBytes.fill(0);
    keypairBytes.fill(0);
  }

  console.log("Created .secrets/buyer-devnet.json");
  console.log(`Public address: ${signer.address}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
