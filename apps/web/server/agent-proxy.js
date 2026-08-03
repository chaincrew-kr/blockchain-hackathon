// agent-proxy.js
// 브라우저가 정산 Agent(Cloud Run, IAM 인증 필요)를 직접 못 부르게 하고
// 이 서버가 대신 인증해서 호출한다 (docs/archive/ponyo_work/GCP_DEPLOYMENT_GUIDE.md §7).
//
// 로컬 agent는 인증 없이 fetch하고, Cloud Run 배포본은 연결된 런타임 서비스
// 계정(ADC)으로 ID 토큰을 발급한다. 로컬에서 원격 Agent를 시험할 때만 선택적으로
// WEB_PROXY_KEY_PATH를 쓸 수 있으며, 운영에서는 JSON 키 파일을 만들지 않는다.
import { GoogleAuth } from "google-auth-library";

const AGENT_BASE_URL = process.env.AGENT_BASE_URL || "http://localhost:4030";
const keyFile = process.env.WEB_PROXY_KEY_PATH;
const useIamAuth = process.env.AGENT_USE_IAM_AUTH === "true";

let idTokenClientPromise;

function getIdTokenClient() {
  if (!useIamAuth) return null;
  const auth = keyFile ? new GoogleAuth({ keyFile }) : new GoogleAuth();
  idTokenClientPromise ??= auth.getIdTokenClient(AGENT_BASE_URL);
  return idTokenClientPromise;
}

/**
 * Agent의 API를 대신 호출한다. 성공·실패 구분 없이 { status, body }를
 * 그대로 돌려주므로, 호출부는 이걸 그대로 res.status(status).json(body)하면 된다.
 */
export async function proxyToAgent(path, { method = "GET" } = {}) {
  const url = `${AGENT_BASE_URL}${path}`;
  const client = await getIdTokenClient();

  if (client) {
    const response = await client.request({
      url,
      method,
      validateStatus: () => true, // 4xx/5xx도 우리가 그대로 전달
    });
    return { status: response.status, body: response.data };
  }

  const response = await fetch(url, { method });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
