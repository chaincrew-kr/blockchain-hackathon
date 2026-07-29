import { createKeyPairSignerFromBytes } from "@solana/kit";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const keypairUrl = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]))
  : new URL("../../../.secrets/buyer-devnet.json", import.meta.url);

async function main(): Promise<void> {
  let json: string;
  try {
    json = await readFile(keypairUrl, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        "Keypair file does not exist. Pass its path after `npm run wallet:address --`.",
        { cause: error },
      );
    }
    throw error;
  }

  const values: unknown = JSON.parse(json);
  if (
    !Array.isArray(values) ||
    values.length !== 64 ||
    !values.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255,
    )
  ) {
    throw new Error("buyer-devnet.json must contain a 64-byte numeric array.");
  }

  const signer = await createKeyPairSignerFromBytes(Uint8Array.from(values));
  console.log(signer.address);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
