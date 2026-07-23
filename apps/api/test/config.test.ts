import { describe, expect, it } from "vitest";

import { loadConfig, SOLANA_DEVNET } from "../src/config.js";

describe("loadConfig", () => {
  it("uses safe testnet defaults", () => {
    const config = loadConfig({
      SVM_ADDRESS: "11111111111111111111111111111111",
    });

    expect(config.network).toBe(SOLANA_DEVNET);
    expect(config.price).toBe("$0.001");
    expect(config.port).toBe(4021);
  });

  it("requires a receiving address", () => {
    expect(() => loadConfig({})).toThrow("SVM_ADDRESS is required");
  });

  it("rejects prices with more than six decimals", () => {
    expect(() =>
      loadConfig({
        SVM_ADDRESS: "11111111111111111111111111111111",
        PAYMENT_PRICE: "$0.0000001",
      }),
    ).toThrow("PAYMENT_PRICE");
  });
});
