// agent-proxy.js
// 브라우저가 정산 Agent(Cloud Run, IAM 인증 필요)를 직접 못 부르게 하고
// 이 서버가 대신 인증해서 호출한다 (docs/ponyo_work/GCP_DEPLOYMENT_GUIDE.md §7).
//
// WEB_PROXY_KEY_PATH가 없으면(로컬 개발) 인증 없이 로컬 agent에 그냥 fetch —
// 로컬 agent는 IAM 보호가 없으므로 이걸로 충분하고, Cloud Run 배포본에서만
// 서비스 계정 키로 ID 토큰을 붙인다.
import { GoogleAuth } from "google-auth-library";

const AGENT_BASE_URL = process.env.AGENT_BASE_URL || "http://localhost:4030";
const keyFile = process.env.WEB_PROXY_KEY_PATH;

let idTokenClientPromise;

function getIdTokenClient() {
  if (!keyFile) return null;
  idTokenClientPromise ??= new GoogleAuth({ keyFile }).getIdTokenClient(
    AGENT_BASE_URL,
  );
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
