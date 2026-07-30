// extract-service.js
// Gemini 호출 로직만 담당. index.js(HTTP 서버)에서 import해서 씀.

import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const systemPrompt = fs.readFileSync(
  path.join(import.meta.dirname, "system-prompt.txt"),
  "utf-8",
);
const schema = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "extraction-schema.json"),
    "utf-8",
  ),
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * @param {Buffer} pdfBuffer - 업로드된 계약서 PDF의 바이너리
 * @returns {Promise<object>} - extraction-schema.json 형태의 결과 (rule/evidence/conflicts/overallConfidence)
 */
export async function extractContractRules(pdfBuffer) {
  const pdfBase64 = pdfBuffer.toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
          {
            text: "위 계약서를 읽고 지정된 스키마에 맞춰 정산 규칙을 추출하세요.",
          },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  return JSON.parse(response.text);
}
