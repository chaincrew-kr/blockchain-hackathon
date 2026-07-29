/**
 * 배치 API 견고성 테스트 — 멱등성, 상태코드 분류, requestId 전파.
 *
 * 포트 0으로 임시 서버를 띄워 실제 HTTP 왕복을 검증한다 (supertest 미도입).
 */
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { ChainGateway, SettleBatchResult } from "../src/chain/gateway.js";
import { StubChainGateway } from "../src/chain/gateway.js";
import { demoBatch } from "../src/fixtures/screenings.js";
import type { PipelineDeps } from "../src/pipeline.js";
import { AgentStore } from "../src/store.js";

interface TestServer {
  url: string;
  close: () => Promise<void>;
}

const servers: TestServer[] = [];

async function start(deps: PipelineDeps, store = new AgentStore(demoBatch)) {
  // 테스트 서버를 외부 인터페이스(0.0.0.0)에 노출하지 않고 loopback에만 연다.
  const server = createApp(store, deps).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  const handle: TestServer = {
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      // Node fetch(undici)는 keep-alive 소켓을 재사용한다. 테스트가 끝난 뒤
      // 연결부터 끊고 listener를 닫아야 server.close 콜백이 소켓 만료까지
      // 기다리지 않는다.
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
  servers.push(handle);
  return { ...handle, store };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

/** 항상 실패하는 체인 — 업스트림 장애(502) 분류 확인용 */
class FailingChainGateway implements ChainGateway {
  async settleBatch(): Promise<SettleBatchResult> {
    throw new Error("RPC connection refused");
  }
  async markDisputed(): Promise<SettleBatchResult> {
    throw new Error("RPC connection refused");
  }
}

/** 응답을 지연시켜 동시 요청 상황을 재현하는 체인 */
class SlowChainGateway extends StubChainGateway {
  constructor(private readonly delayMs: number) {
    super();
  }
  override async settleBatch(screeningId: string, amount: number) {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return super.settleBatch(screeningId, amount);
  }
  override async markDisputed(screeningId: string, amount: number) {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return super.markDisputed(screeningId, amount);
  }
}

describe("POST /api/batch/trigger — 멱등성", () => {
  it("두 번 호출해도 체인은 한 번만 호출된다 (이중 정산 방지)", async () => {
    const gateway = new StubChainGateway();
    const { url } = await start({ chainGateway: gateway });

    const first = await fetch(`${url}/api/batch/trigger`, { method: "POST" });
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.replayed).toBe(false);
    expect(firstBody.decisions).toHaveLength(2);

    const second = await fetch(`${url}/api/batch/trigger`, { method: "POST" });
    const secondBody = await second.json();
    expect(second.status).toBe(200);
    expect(secondBody.replayed).toBe(true);

    // 같은 판정을 그대로 돌려준다
    expect(secondBody.decisions).toEqual(firstBody.decisions);
    // 핵심 — 회차 2건에 대한 호출 2회뿐. 4회면 이중 정산이다.
    expect(gateway.calls).toHaveLength(2);
  });

  it("실행 중 들어온 동시 요청은 409 batch_in_progress", async () => {
    const gateway = new SlowChainGateway(50);
    const { url } = await start({ chainGateway: gateway });

    const [a, b] = await Promise.all([
      fetch(`${url}/api/batch/trigger`, { method: "POST" }),
      fetch(`${url}/api/batch/trigger`, { method: "POST" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const conflict = a.status === 409 ? a : b;
    const body = await conflict.json();
    expect(body.error.code).toBe("batch_in_progress");
    expect(body.error.requestId).toBeTruthy();

    // 동시에 두 번 들어와도 체인 호출은 회차 수만큼만
    expect(gateway.calls).toHaveLength(2);
  });

  it("reset 후에는 다시 실행된다 (리허설 반복용)", async () => {
    const gateway = new StubChainGateway();
    const { url } = await start({ chainGateway: gateway });

    await fetch(`${url}/api/batch/trigger`, { method: "POST" });
    const reset = await fetch(`${url}/api/batch/reset`, { method: "POST" });
    expect(reset.status).toBe(200);
    expect((await reset.json()).runState).toBe("idle");

    const again = await fetch(`${url}/api/batch/trigger`, { method: "POST" });
    expect((await again.json()).replayed).toBe(false);
    expect(gateway.calls).toHaveLength(4);
  });

  it("실행 중 reset 요청은 409이고 진행 중인 정산은 유지된다", async () => {
    const gateway = new SlowChainGateway(50);
    const { url, store } = await start({ chainGateway: gateway });

    const trigger = fetch(`${url}/api/batch/trigger`, { method: "POST" });

    // trigger 요청이 서버에 도달해 실행 슬롯을 점유할 때까지 기다린다.
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 1_000;
      const poll = () => {
        if (store.runState === "running") {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error("batch did not enter running state"));
          return;
        }
        setTimeout(poll, 5);
      };
      poll();
    });

    const reset = await fetch(`${url}/api/batch/reset`, { method: "POST" });
    expect(reset.status).toBe(409);
    expect((await reset.json()).error.code).toBe("batch_in_progress");

    const completed = await trigger;
    expect(completed.status).toBe(200);
    expect(store.runState).toBe("completed");
    expect(gateway.calls).toHaveLength(2);
  });
});

describe("오류 분류 — 4xx는 호출자 문제, 5xx는 우리·업스트림 문제", () => {
  it("체인 호출 실패는 500이 아니라 502 chain_call_failed", async () => {
    const { url } = await start({ chainGateway: new FailingChainGateway() });

    const response = await fetch(`${url}/api/batch/trigger`, {
      method: "POST",
    });
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.error.code).toBe("chain_call_failed");
    // 내부 예외 메시지가 그대로 새어나가면 안 된다
    expect(JSON.stringify(body)).not.toContain("RPC connection refused");
  });

  it("체인 실패 후에도 잠금이 풀려 재시도할 수 있다", async () => {
    const { url, store } = await start({
      chainGateway: new FailingChainGateway(),
    });

    await fetch(`${url}/api/batch/trigger`, { method: "POST" });
    expect(store.runState).toBe("idle");

    // 두 번째 시도도 409가 아니라 502 — 잠금이 남아 있지 않다
    const retry = await fetch(`${url}/api/batch/trigger`, { method: "POST" });
    expect(retry.status).toBe(502);
  });

  it("없는 경로는 404 not_found", async () => {
    const { url } = await start({ chainGateway: new StubChainGateway() });

    const response = await fetch(`${url}/api/nope`);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });
});

describe("requestId 전파", () => {
  it("모든 응답에 X-Request-Id가 붙는다", async () => {
    const { url } = await start({ chainGateway: new StubChainGateway() });

    const response = await fetch(`${url}/health`);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("성공·실패 응답의 로그 경로가 동일한 형태다", async () => {
    const { url } = await start({ chainGateway: new StubChainGateway() });
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      await fetch(`${url}/api/batch/trigger`, { method: "POST" });
    } finally {
      process.stdout.write = original;
    }

    const completed = lines
      .map((l) => JSON.parse(l))
      .find((e) => e.message === "request completed");
    // 라우터 상대경로(/batch/trigger)가 아니라 전체 경로여야 필터가 맞는다
    expect(completed.path).toBe("/api/batch/trigger");
  });

  it("클라이언트가 보낸 X-Request-Id를 이어받는다", async () => {
    const { url } = await start({ chainGateway: new StubChainGateway() });

    const response = await fetch(`${url}/api/nope`, {
      headers: { "X-Request-Id": "trace-me-123" },
    });
    expect(response.headers.get("x-request-id")).toBe("trace-me-123");
    expect((await response.json()).error.requestId).toBe("trace-me-123");
  });
});
