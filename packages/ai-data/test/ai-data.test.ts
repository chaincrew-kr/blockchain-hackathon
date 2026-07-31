import type { ScreeningMeta, VerificationResult } from "@chaincrew/schema";
import { describe, expect, it, vi } from "vitest";

import {
  createNarrativeGeneratorFromEnv,
  GeminiNarrativeGenerator,
  KobisClient,
  templateNarrative,
  type NarrativeContext,
} from "../src/index.js";

const meta: ScreeningMeta = {
  screeningId: "SCR-1",
  seatCount: 50,
  averageOccupancy: 0.4,
  historicalRefundRate: 0.04,
};

const verification: VerificationResult = {
  screeningId: meta.screeningId,
  thresholds: {
    maxRefundRate: 0.1,
    maxFreeRate: 0.15,
    maxTicketsPerScreening: 50,
  },
  checks: [
    {
      check: "free-rate",
      passed: false,
      observed: 0.2,
      threshold: 0.15,
    },
  ],
  allPassed: false,
};

const context: NarrativeContext = {
  verification,
  meta,
  verdict: "partial-hold",
  heldAmount: 1_000,
  basisClauses: ["제5조 무료 발권 상한"],
};

describe("AI narrative ownership", () => {
  it("uses the template when no Gemini key exists", () => {
    const setup = createNarrativeGeneratorFromEnv({});
    expect(setup.mode).toBe("template");
    expect(setup.generator).toBe(templateNarrative);
  });

  it("calls Gemini with the decision context", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "무료 발권 초과로 보류합니다." }] } },
          ],
        }),
        { status: 200 },
      ),
    );
    const generator = new GeminiNarrativeGenerator({
      apiKey: "test-key",
      fetchImplementation,
    });

    await expect(generator.generate(context)).resolves.toBe(
      "무료 발권 초과로 보류합니다.",
    );
    const [, request] = fetchImplementation.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(request.headers).toMatchObject({ "x-goog-api-key": "test-key" });
    expect(String(request.body)).toContain("SCR-1");
  });

  it("falls back to the template when Gemini is unavailable", async () => {
    const fetchImplementation = vi
      .fn()
      .mockRejectedValue(new Error("network unavailable"));
    const setup = createNarrativeGeneratorFromEnv(
      { GEMINI_API_KEY: "test-key" },
      fetchImplementation,
    );

    await expect(setup.generator.generate(context)).resolves.toContain(
      "분쟁 격리",
    );
  });
});

describe("KobisClient", () => {
  it("normalizes the daily box office response", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          boxOfficeResult: {
            dailyBoxOfficeList: [
              {
                rank: "1",
                rankInten: "2",
                movieCd: "20260001",
                movieNm: "독립영화",
                openDt: "20260701",
                salesAmt: "100000",
                audiCnt: "100",
                audiAcc: "1000",
                scrnCnt: "10",
                showCnt: "20",
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const client = new KobisClient({
      apiKey: "kobis-key",
      fetchImplementation,
    });

    const result = await client.getDailyBoxOffice("20260730");

    expect(result[0]).toMatchObject({
      rank: 1,
      movieName: "독립영화",
      audienceCount: 100,
      screenCount: 10,
    });
    const [url] = fetchImplementation.mock.calls[0] as [URL];
    expect(url.searchParams.get("targetDt")).toBe("20260730");
    expect(url.searchParams.get("key")).toBe("kobis-key");
  });
});
