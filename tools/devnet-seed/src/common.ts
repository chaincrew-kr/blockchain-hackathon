/**
 * devnet 시딩 스크립트 공통 유틸 — Solana CLI 64바이트 키페어 파일 로딩,
 * IDL 로딩, PDA 계산. apps/agent/src/chain/keypair.ts와 같은 파일 형식을
 * 기대한다(숫자 배열 JSON, 32바이트 secret + 32바이트 public).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { web3 } from "@coral-xyz/anchor";
import type { Idl, Program } from "@coral-xyz/anchor";

export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function loadKeypairFile(path: string): web3.Keypair {
  const resolved = resolve(repoRoot, path);
  let raw: string;
  try {
    raw = readFileSync(resolved, "utf8");
  } catch (cause) {
    throw new Error(`키페어 파일을 읽을 수 없습니다: ${resolved}`, { cause });
  }
  const bytes: unknown = JSON.parse(raw);
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new Error(`키페어 파일이 64바이트 숫자 배열이 아닙니다: ${resolved}`);
  }
  return web3.Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
}

export function loadIdl(programId: web3.PublicKey): Idl {
  const idlPath = resolve(repoRoot, "packages/schema/idl/movie_escrow.json");
  const parsed = JSON.parse(readFileSync(idlPath, "utf8")) as Idl;
  // 같은 IDL을 localnet/devnet 어디에나 쓸 수 있도록 실행 시점의 Program ID로 덮어쓴다
  // (D의 apps/agent/src/chain/anchor-gateway.ts와 동일한 패턴).
  return { ...parsed, address: programId.toBase58() } as Idl;
}

export const ROLE_INDEX = {
  theater: 0,
  distributor: 1,
  producer: 2,
  investor: 3,
} as const;

export function escrowPda(
  movieId: string,
  programId: web3.PublicKey,
): web3.PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(movieId)],
    programId,
  )[0];
}

export function computeRuleHash(rule: {
  ruleVersion: number;
  theaterBps: number;
  distributorBps: number;
  distributionFeeBps: number;
  investorProfitBps: number;
}): Buffer {
  return createHash("sha256")
    .update(
      [
        rule.ruleVersion,
        rule.theaterBps,
        rule.distributorBps,
        rule.distributionFeeBps,
        rule.investorProfitBps,
      ].join("|"),
    )
    .digest();
}

/**
 * program.methods[name](...)는 제네릭 Idl 타입에서 인덱스 시그니처가
 * `possibly undefined`로 잡혀 tsc가 거부한다 — D의 anchor-gateway.ts와
 * 동일한 문제라 같은 방식(런타임 존재 체크 + 캐스팅)으로 우회한다.
 */
interface AnchorMethodBuilder {
  accountsStrict(accounts: Record<string, web3.PublicKey>): {
    instruction(): Promise<web3.TransactionInstruction>;
    rpc(): Promise<string>;
  };
}

export function programMethod(
  program: Program,
  name: string,
  ...args: unknown[]
): AnchorMethodBuilder {
  const methods = program.methods as unknown as Record<
    string,
    (...values: unknown[]) => AnchorMethodBuilder
  >;
  const factory = methods[name];
  if (!factory) {
    throw new Error(`IDL에서 instruction을 찾을 수 없습니다: ${name}`);
  }
  return factory(...args);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 필요합니다.`);
  }
  return value;
}
