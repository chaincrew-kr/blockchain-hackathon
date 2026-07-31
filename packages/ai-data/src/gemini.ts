import {
  templateNarrative,
  type NarrativeContext,
  type NarrativeGenerator,
} from "./narrative.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export interface GeminiNarrativeConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
}

function buildPrompt(context: NarrativeContext): string {
  return [
    "당신은 독립영화 온체인 정산 에이전트입니다.",
    "아래 판정을 영화관·배급사·제작사가 이해할 수 있는 한국어 2~3문장으로 설명하세요.",
    "측정값, 보류 임계, 근거 조항, 보류 금액을 정확히 언급하세요.",
    "확인되지 않은 조항이나 사실을 만들지 말고 마크다운을 사용하지 마세요.",
    JSON.stringify({
      screeningId: context.verification.screeningId,
      verdict: context.verdict,
      heldAmount: context.heldAmount,
      basisClauses: context.basisClauses,
      checks: context.verification.checks,
      screeningMeta: context.meta,
    }),
  ].join("\n");
}

export class GeminiNarrativeGenerator implements NarrativeGenerator {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly config: GeminiNarrativeConfig) {
    if (!config.apiKey.trim()) {
      throw new Error("Gemini API key is required.");
    }
    // gemini-2.5-flash는 신규 사용자에게 더 이상 제공되지 않음(404) — 확인된
    // 대체 모델로 교체. 참고: apps/web/server/extract-service.js도 동일 이슈로
    // 같은 모델명 사용 중.
    this.model = config.model ?? "gemini-3.5-flash";
    this.baseUrl =
      config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    this.fetchImplementation = config.fetchImplementation ?? fetch;
  }

  async generate(context: NarrativeContext): Promise<string> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(context) }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}.`);
    }

    const body = (await response.json()) as GeminiResponse;
    const narrative = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!narrative) {
      throw new Error("Gemini returned an empty narrative.");
    }
    return narrative;
  }
}

export interface NarrativeSetup {
  generator: NarrativeGenerator;
  mode: "gemini" | "template";
}

export class FallbackNarrativeGenerator implements NarrativeGenerator {
  constructor(
    private readonly primary: NarrativeGenerator,
    private readonly fallback: NarrativeGenerator = templateNarrative,
  ) {}

  async generate(context: NarrativeContext): Promise<string> {
    try {
      return await this.primary.generate(context);
    } catch {
      return this.fallback.generate(context);
    }
  }
}

export function createNarrativeGeneratorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImplementation?: typeof fetch,
): NarrativeSetup {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { generator: templateNarrative, mode: "template" };
  }

  return {
    generator: new FallbackNarrativeGenerator(
      new GeminiNarrativeGenerator({
        apiKey,
        ...(env.GEMINI_MODEL ? { model: env.GEMINI_MODEL } : {}),
        ...(fetchImplementation ? { fetchImplementation } : {}),
      }),
    ),
    mode: "gemini",
  };
}
