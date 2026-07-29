/**
 * 체인 게이트웨이 테스트 — 연결 계층과 폴백 동작.
 *
 * IDL이 아직 없으므로 실제 instruction 호출은 검증할 수 없다. 대신 **IDL이
 * 없을 때 어떻게 실패하는지**를 고정한다 — 조용히 성공한 척하는 게 가장 위험하다.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { web3 } from "@coral-xyz/anchor";
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

describe("AnchorChainGateway — IDL 없을 때의 실패 방식", () => {
  function gateway() {
    return new AnchorChainGateway({
      rpcUrl: "http://127.0.0.1:8899",
      programId: PROGRAM_ID,
      keypairPath,
    });
  }

  it("authority 공개키를 노출한다 — Explorer 대조용", () => {
    expect(gateway().authority).toBe(expectedPubkey);
  });

  it("settle_batch는 502 ChainCallError로 실패한다", async () => {
    await expect(gateway().settleBatch("SCR-1", 1000)).rejects.toMatchObject({
      status: 502,
      code: "chain_call_failed",
      instruction: "settle_batch",
    });
  });

  it("실패 사유에 IDL 대기 상태가 드러난다 — 조용히 실패하지 않는다", async () => {
    await expect(gateway().markDisputed("SCR-2", 500)).rejects.toThrow(/IDL/);
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
