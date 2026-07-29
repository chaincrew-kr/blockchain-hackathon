import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";
import { randomBytes, webcrypto } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const secretsDirectoryUrl = new URL("../../../.secrets/", import.meta.url);

async function main(): Promise<void> {
  // 지갑 이름: 극장/배급/제작/투자/에이전트 5종 생성용. 예) npm run wallet:create -- theater
  const walletName = process.argv[2] ?? "buyer";
  if (!/^[a-z0-9-]+$/.test(walletName)) {
    throw new Error(
      "Wallet name must be lowercase letters, digits, or hyphens.",
    );
  }
  const keypairFileName = `${walletName}-devnet.json`;
  const keypairUrl = new URL(keypairFileName, secretsDirectoryUrl);

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
        `${keypairFileName} already exists. It was not overwritten.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    privateKeyBytes.fill(0);
    keypairBytes.fill(0);
  }

  console.log(`Created .secrets/${keypairFileName}`);
  console.log(`Public address: ${signer.address}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
