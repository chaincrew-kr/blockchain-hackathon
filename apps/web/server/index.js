// index.js
// 실행: node index.js  (또는 npm run dev, package.json에 스크립트 추가 시)
//
// 준비물:
//   npm install express multer cors dotenv @google/genai
//   .env 파일에 GEMINI_API_KEY=발급받은키   (아래 STEP 참고)

import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";
import cors from "cors";
import { extractContractRules } from "./extract-service.js";
import { fetchMovieInfo, fetchDailyAudience } from "./kobis-service.js";
import { proxyToAgent } from "./agent-proxy.js";

// KOBIS 대조 대상 — 「어떻게 해야 했을까?」(2026-07-29 개봉)
const DEFAULT_MOVIE_CD = "20264148";

const app = express();
const serverDir = dirname(fileURLToPath(import.meta.url));
const webDistDir = resolve(serverDir, "../dist");
const webIndexPath = resolve(webDistDir, "index.html");
const demoAuthUser = process.env.DEMO_AUTH_USER;
const demoAuthPassword = process.env.DEMO_AUTH_PASSWORD;

if (Boolean(demoAuthUser) !== Boolean(demoAuthPassword)) {
  throw new Error(
    "DEMO_AUTH_USER와 DEMO_AUTH_PASSWORD는 둘 다 설정하거나 둘 다 비워야 합니다.",
  );
}

function secretMatches(actual, expected) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

// 공개 데모 URL에서 Gemini·KOBIS·정산 프록시가 무제한 호출되지 않도록 보호한다.
// /health는 Cloud Run과 운영 점검을 위해 인증 없이 둔다.
app.use((req, res, next) => {
  if (req.path === "/health" || !demoAuthUser || !demoAuthPassword) {
    next();
    return;
  }

  const authorization = req.get("authorization") ?? "";
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString(
        "utf8",
      );
      const separator = decoded.indexOf(":");
      const user = separator >= 0 ? decoded.slice(0, separator) : "";
      const password = separator >= 0 ? decoded.slice(separator + 1) : "";
      if (
        secretMatches(user, demoAuthUser) &&
        secretMatches(password, demoAuthPassword)
      ) {
        next();
        return;
      }
    } catch {
      // 잘못된 Basic 헤더는 아래 401로 처리한다.
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="ChainCrew Demo"');
  res.status(401).send("Authentication required");
});

const upload = multer({
  storage: multer.memoryStorage(), // 디스크에 안 남기고 메모리에서만 처리 (계약서 원문은 FR-06 원칙상 온체인엔 안 올라가지만, 서버 로컬 디스크에도 굳이 남길 필요 없음)
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB 제한
});

// 로컬 개발 중엔 React(보통 5173 포트)에서 이 서버(8787 포트)로 요청 보내야 하므로 CORS 허용
app.use(cors());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// 계약서 PDF 1개를 받아서 Gemini로 정산 규칙을 추출하는 엔드포인트
app.post("/api/extract", upload.single("contract"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "contract 필드로 PDF 파일을 첨부해주세요." });
  }
  if (req.file.mimetype !== "application/pdf") {
    return res.status(400).json({ error: "PDF 파일만 지원합니다." });
  }

  try {
    console.log(
      `[extract] ${req.file.originalname} (${req.file.size} bytes) 처리 시작`,
    );
    const result = await extractContractRules(req.file.buffer);
    console.log(
      `[extract] 완료 — 충돌 ${result.conflicts?.length ?? 0}건, 신뢰도 ${result.overallConfidence}`,
    );
    res.json(result);
  } catch (err) {
    console.error("[extract] 실패:", err);
    res
      .status(500)
      .json({ error: "추출 중 오류가 발생했습니다.", detail: String(err) });
  }
});

// KOBIS 영화 상세정보 (감독·배급사·개봉일 등, 순위 무관 항상 조회 가능)
app.get("/api/kobis/movie-info", async (req, res) => {
  const movieCd = req.query.movieCd || DEFAULT_MOVIE_CD;
  try {
    const info = await fetchMovieInfo(movieCd);
    res.json(info);
  } catch (err) {
    console.error("[kobis/movie-info] 실패:", err);
    res
      .status(500)
      .json({ error: "KOBIS 영화정보 조회 실패", detail: String(err) });
  }
});

// KOBIS 최근 N일 관객수 (순위권 밖인 날은 0)
app.get("/api/kobis/daily", async (req, res) => {
  const movieCd = req.query.movieCd || DEFAULT_MOVIE_CD;
  const days = Number(req.query.days) || 7;
  try {
    const data = await fetchDailyAudience(movieCd, days);
    res.json(data);
  } catch (err) {
    console.error("[kobis/daily] 실패:", err);
    res
      .status(500)
      .json({ error: "KOBIS 일별 데이터 조회 실패", detail: String(err) });
  }
});

// 정산 배치 — IAM 인증이 필요한 Cloud Run Agent를 이 서버가 대신 호출한다
// (agent-proxy.js). 브라우저에는 Agent 키·GCP 키가 절대 노출되지 않는다.
app.post("/api/batch/trigger", async (req, res) => {
  try {
    const { status, body } = await proxyToAgent("/api/batch/trigger", {
      method: "POST",
    });
    res.status(status).json(body);
  } catch (err) {
    console.error("[batch/trigger] 프록시 실패:", err);
    res.status(502).json({
      error: {
        code: "chain_call_failed",
        message: "정산 에이전트에 연결하지 못했습니다.",
        requestId: crypto.randomUUID(),
      },
    });
  }
});

app.post("/api/batch/reset", async (req, res) => {
  try {
    const { status, body } = await proxyToAgent("/api/batch/reset", {
      method: "POST",
    });
    res.status(status).json(body);
  } catch (err) {
    console.error("[batch/reset] 프록시 실패:", err);
    res.status(502).json({
      error: {
        code: "chain_call_failed",
        message: "정산 에이전트에 연결하지 못했습니다.",
        requestId: crypto.randomUUID(),
      },
    });
  }
});

// Cloud Run에서는 React와 API를 한 URL로 제공한다. 로컬 개발은 Vite(4020)와
// Express(8787)를 따로 실행할 수 있도록 dist가 있을 때만 활성화한다.
if (existsSync(webIndexPath)) {
  app.use(express.static(webDistDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(webIndexPath);
  });
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`계약서 추출 서버 실행 중: http://localhost:${PORT}`);
  console.log(
    `테스트: curl -F "contract=@계약서.pdf" http://localhost:${PORT}/api/extract`,
  );
});
