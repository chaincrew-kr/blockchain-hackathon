// src/lib/adaptExtraction.ts
//
// apps/web/server(/api/extract)가 돌려주는 ExtractionApiResponse를
// packages/schema의 SettlementRule(화면이 원하는 형태)로 변환한다.
//
// 두 스키마는 설계자가 달라서(서버=기계용 구조, schema=화면용 구조) 완전히
// 안 맞는다. 그래서 필드별로 하나씩 직접 매핑해준다 — 자동 변환은 안 됨.

import type {
  ExtractedClause,
  RuleConflict,
  SettlementRule,
} from "@chaincrew/schema";
import type { ExtractionApiResponse } from "./api";
import { movieIdFromContractHash } from "./hash";

type Evidence = ExtractionApiResponse["evidence"][number];

/** fieldPath가 주어진 접두사로 시작하는 첫 evidence를 찾는다. */
function findEvidence(
  evidence: Evidence[],
  prefix: string,
): Evidence | undefined {
  return evidence.find((e) => e.fieldPath.startsWith(prefix));
}

/** evidence를 못 찾았을 때의 기본값 (화면이 깨지지 않게) */
const NO_EVIDENCE: Evidence = {
  fieldPath: "",
  sourceClause: "—",
  sourceQuote: "근거 정보 없음",
  confidence: 0,
};

function toClause(
  field: string,
  value: string | number,
  ev: Evidence | undefined,
  conflict = false,
): ExtractedClause & { conflict?: boolean } {
  const e = ev ?? NO_EVIDENCE;
  return {
    field,
    value,
    sourceClause: e.sourceClause,
    sourceText: e.sourceQuote,
    confidence: e.confidence,
    ...(conflict ? { conflict: true } : {}),
  };
}

/** 화면 표시용 당사자 이름. SettlementRule(팀 공용 타입)엔 회사명 필드가 없어서 별도로 둔다. */
export interface PartyNames {
  movieTitle: string;
  distributor: string;
  theater: string;
}

export interface AdaptedExtraction {
  rule: SettlementRule;
  parties: PartyNames;
}

/**
 * 서버 응답을 화면이 쓰는 형태로 변환한다.
 * @param contractHash 업로드한 PDF 원본의 SHA-256 해시(hex). 호출부(BackofficePage)에서
 *   lib/hash.ts의 sha256Hex()로 미리 계산해서 넘겨준다. movieId도 이 값에서 파생된다.
 */
export function adaptExtraction(
  api: ExtractionApiResponse,
  contractHash: string,
): AdaptedExtraction {
  const { rule, evidence, conflicts, parties } = api;

  // 정산일 충돌 여부 (있으면 "정산일" 행에 conflict 배지 표시)
  const paymentDeadlineConflict = conflicts.some(
    (c) => c.field === "settlementTerms.paymentDeadlineDays",
  );

  const region = rule.regionSplit[0]; // 데모는 단일 지역 계약만 다룸
  const feeStep = rule.waterfall.find((w) => w.type === "FEE");
  const mgStep = rule.waterfall.find((w) => w.type === "MG_RECOUP");

  const clauses: (ExtractedClause & { conflict?: boolean })[] = [
    toClause(
      `부율 (${region?.region ?? "?"}·${region?.nationality ?? "?"})`,
      `${(region?.split.THEATER ?? 0) * 100} : ${
        (region?.split.DISTRIBUTOR_POOL ?? 0) * 100
      }`,
      findEvidence(evidence, "regionSplit"),
    ),
    toClause(
      "배급수수료",
      `${(feeStep?.rate ?? 0) * 100}%`,
      findEvidence(evidence, "waterfall[0]"),
    ),
    toClause(
      "MG (미니멈 개런티)",
      mgStep
        ? `${mgStep.mgAmount.toLocaleString()} ${mgStep.mgCurrency}`
        : "없음",
      findEvidence(evidence, "waterfall[1]"),
    ),
    toClause(
      "무료 발권 상한",
      `${rule.ticketPolicy.compTicketCap * 100}%`,
      findEvidence(evidence, "ticketPolicy.compTicketCap"),
    ),
    toClause(
      paymentDeadlineConflict ? "정산일 ⚠" : "정산일",
      `${rule.settlementTerms.paymentDeadlineDays}일`,
      findEvidence(evidence, "settlementTerms.paymentDeadlineDays"),
      paymentDeadlineConflict,
    ),
  ];

  const ruleConflicts: RuleConflict[] = conflicts.map((c) => ({
    fields: [c.field],
    description: c.description,
    resolved: false,
  }));

  const settlementRule: SettlementRule = {
    version: 1, // STAGE 0 첫 추출 = v1. 재추출/개정 로직은 아직 없음.
    movieId: movieIdFromContractHash(contractHash),
    movieTitle: parties.movieTitle,
    revenueShare: {
      theater: region?.split.THEATER ?? 0,
      distributor: region?.split.DISTRIBUTOR_POOL ?? 0,
    },
    distributionFeeRate: feeStep?.rate ?? 0,
    minimumGuarantee: mgStep && mgStep.mgAmount > 0 ? mgStep.mgAmount : null,
    settlementDays: rule.settlementTerms.paymentDeadlineDays,
    freeTicketCapRate: rule.ticketPolicy.compTicketCap,
    disputeThresholds: {
      refundRate: rule.disputeThresholds.refundRate,
      freeTicketRate: rule.disputeThresholds.freeTicketRate,
    },
    clauses,
    conflicts: ruleConflicts,
    approvals: { distributor: false, theater: false },
    contractHash,
    ruleHash: null, // 온체인 등록(init_escrow) 이후 B가 채워줄 값
  };

  return { rule: settlementRule, parties };
}
