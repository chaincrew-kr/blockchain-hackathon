/**
 * 체인 게이트웨이 테스트 — 연결 계층과 폴백 동작.
 *
 * 실제 IDL을 로드해 PDA와 instruction 호출 계약을 검증한다.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { BN, web3 } from "@coral-xyz/anchor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AnchorChainGateway } from "../src/chain/anchor-gateway.js";
import { StubChainGateway } from "../src/chain/gateway.js";
import { createChainGateway } from "../src/chain/index.js";
import { loadKeypairFile } from "../src/chain/keypair.js";
import { demoBatch } from "../src/fixtures/screenings.js";
import { AgentStore } from "../src/store.js";

/** Anchor.toml의 movie_escrow placeholder */
const PROGRAM_ID = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
const IDL_PATH = fileURLToPath(
  new URL("../../../packages/schema/idl/movie_escrow.json", import.meta.url),
);

let dir: string;
let keypairPath: string;
let expectedPubkey: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "chaincrew-chain-"));
  keypairPath = join(dir, "agent.json");

  const kp = web3.Keypair.generate();
  expectedPubkey = kp.publicKey.toBase58();
  writeFileSync(keypairPath, JSON.stringify(Array.from(kp.secretKey)));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadKeypairFile", () => {
  it("Solana CLI JSON 키파일을 읽는다", () => {
    expect(loadKeypairFile(keypairPath).publicKey.toBase58()).toBe(
      expectedPubkey,
    );
  });

  it("없는 파일은 경로를 알려주며 실패한다", () => {
    const missing = join(dir, "nope.json");
    expect(() => loadKeypairFile(missing)).toThrow(missing);
  });

  it("JSON이 아니면 형식을 알려주며 실패한다", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "not json at all");
    expect(() => loadKeypairFile(bad)).toThrow(/Solana CLI 형식/);
  });

  it("길이가 64가 아니면 거부한다 — 공개키만 담긴 파일 방어", () => {
    const short = join(dir, "short.json");
    writeFileSync(short, JSON.stringify(new Array(32).fill(1)));
    expect(() => loadKeypairFile(short)).toThrow(/64가 아닙니다 \(32\)/);
  });
});

describe("createChainGateway — 환경변수에 따른 선택", () => {
  const fullEnv = {
    SOLANA_RPC_URL: "http://127.0.0.1:8899",
    SOLANA_PROGRAM_ID: PROGRAM_ID,
    get AGENT_KEYPAIR_PATH() {
      return keypairPath;
    },
    SOLANA_IDL_PATH: IDL_PATH,
    ESCROW_MOVIE_ID: "movie-test-1",
    get THEATER_WALLET() {
      return expectedPubkey;
    },
    get DISTRIBUTOR_WALLET() {
      return expectedPubkey;
    },
    get PRODUCER_WALLET() {
      return expectedPubkey;
    },
    get INVESTOR_WALLET() {
      return expectedPubkey;
    },
    THEATER_BPS: "5000",
    DISTRIBUTOR_BPS: "5000",
    DISTRIBUTION_FEE_BPS: "1000",
    INVESTOR_PROFIT_BPS: "6000",
  } as NodeJS.ProcessEnv;

  it("환경변수가 다 있으면 anchor 모드", () => {
    const setup = createChainGateway(fullEnv);
    expect(setup.mode).toBe("anchor");
    expect(setup.gateway).toBeInstanceOf(AnchorChainGateway);
    expect(setup.authority).toBe(expectedPubkey);
  });

  it("하나라도 비면 스텁으로 떨어진다", () => {
    for (const key of [
      "SOLANA_RPC_URL",
      "SOLANA_PROGRAM_ID",
      "AGENT_KEYPAIR_PATH",
    ]) {
      const env = { ...fullEnv, [key]: "" };
      const setup = createChainGateway(env);
      expect(setup.mode, `${key} 없을 때`).toBe("stub");
      expect(setup.gateway).toBeInstanceOf(StubChainGateway);
    }
  });

  it("키파일이 잘못돼도 서버가 죽지 않고 스텁으로 내려앉는다", () => {
    const setup = createChainGateway({
      ...fullEnv,
      AGENT_KEYPAIR_PATH: join(dir, "does-not-exist.json"),
    });
    expect(setup.mode).toBe("stub");
  });
});

describe("AnchorChainGateway — IDL과 PDA 계약", () => {
  function gateway() {
    return new AnchorChainGateway({
      rpcUrl: "http://127.0.0.1:8899",
      programId: PROGRAM_ID,
      keypairPath,
      idlPath: IDL_PATH,
      movieId: "movie-test-1",
      theaterWallet: expectedPubkey,
      distributorWallet: expectedPubkey,
      producerWallet: expectedPubkey,
      investorWallet: expectedPubkey,
      theaterBps: 5000,
      distributorBps: 5000,
      distributionFeeBps: 1000,
      investorProfitBps: 6000,
    });
  }

  it("authority 공개키를 노출한다 — Explorer 대조용", () => {
    expect(gateway().authority).toBe(expectedPubkey);
  });

  it("영화별 escrow와 역할별 Allocation PDA를 각각 계산한다", () => {
    const addresses = gateway().addresses;
    expect(new Set(Object.values(addresses.allocations)).size).toBe(4);
    expect(addresses.escrow).not.toBe(addresses.allocations.theater);
  });

  it("이상 회차는 verify → settle → 권리자별 markDisputed 순서로 실행한다", async () => {
    const target = gateway();
    const addresses = target.addresses;
    const roleAmounts = new Map(
      Object.entries(addresses.allocations).map(([role, address], index) => [
        address,
        { role, amount: (index + 1) * 10 },
      ]),
    );
    const calls: Array<{ name: string; args: unknown[] }> = [];
    let settled = false;

    function builder(name: string, args: unknown[]) {
      return {
        accountsStrict() {
          return {
            async rpc() {
              calls.push({ name, args });
              if (name === "settleBatch") settled = true;
              const role =
                name === "markDisputed"
                  ? roleAmounts.size -
                    calls.filter((call) => call.name === "markDisputed").length
                  : 0;
              return `${name}-tx-${role}`;
            },
          };
        },
      };
    }

    const fakeProgram = {
      account: {
        movieEscrow: {
          async fetchNullable() {
            return { state: { pending: {} } };
          },
        },
        allocation: {
          async fetchNullable(address: web3.PublicKey) {
            const item = roleAmounts.get(address.toBase58());
            return settled && item ? { claimable: new BN(item.amount) } : null;
          },
        },
      },
      methods: {
        verifyEscrow: (...args: unknown[]) => builder("verifyEscrow", args),
        settleBatch: (...args: unknown[]) => builder("settleBatch", args),
        markDisputed: (...args: unknown[]) => builder("markDisputed", args),
      },
    };
    Object.defineProperty(target, "program", { value: fakeProgram });

    const result = await target.markDisputed("SCR-HOLD", 100);

    expect(calls.map((call) => call.name)).toEqual([
      "verifyEscrow",
      "settleBatch",
      "markDisputed",
      "markDisputed",
      "markDisputed",
      "markDisputed",
    ]);
    expect(
      calls
        .filter((call) => call.name === "markDisputed")
        .map((call) => (call.args[0] as BN).toNumber()),
    ).toEqual([10, 20, 30, 40]);
    expect(result.txSignatures).toHaveLength(6);
  });
});

describe("GET /health — 체인 모드 노출 (이슈 #18)", () => {
  it("스텁이면 chain: stub으로 알린다", async () => {
    const app = createApp(
      new AgentStore(demoBatch),
      { chainGateway: new StubChainGateway() },
      { chainMode: "stub" },
    );
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as { port: number };

    try {
      const body = await fetch(`http://127.0.0.1:${port}/health`).then((r) =>
        r.json(),
      );
      expect(body).toEqual({ status: "ok", chain: "stub" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
