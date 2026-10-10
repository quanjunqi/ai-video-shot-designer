#!/usr/bin/env python3
"""闭环验收用的本地桩：目录(catalog) + 凭据(creds) + 上游(upstream) 三角色。

## 为什么需要它（判据）
`services/execution/internal/engine/usage.go:43-45` 从【响应体】里抽取
`usage.prompt_tokens` / `usage.completion_tokens` / `usage.cached_tokens` ⇒
**D4a/D4c（token 落库）必须经过一次真实调用才能验证**。
而 `scripts/audit-verdicts.sh` 自己写着「D4a/D4c 需要真实上游调用 ⇒ 会产生费用，
故不放进自动套件」⇒ 于是这条链**没有可重跑的判据**。

本桩把"真实调用"变成**本地、免费、可复现**：execution 仍然走完整的网关链路
（解析目录 → reveal 凭据 → 发 HTTP → 抽 usage → 写审计），只是目的地是 localhost。

## 端口与用法
    python3 scripts/stub-upstream.py <port> [logfile]
    GET  /internal/v1/catalog                                  目录（模型/协议模板/渠道）
    GET  /internal/v1/workspaces/<ws>/channels                 用户渠道
    GET  /internal/v1/workspaces/<ws>/credentials               凭据存在性
    GET  /internal/v1/workspaces/<ws>/credentials/<ch>/reveal   凭据明文（含 baseUrl）
    POST /upstream/<任意>                                       假上游：返回带 usage 的响应
    GET  /__stub/requests                                       桩收到的请求（供套件断言）

字段形状严格照抄调用方（判据：catalog/client.go:28-60 · creds/client.go:28-42,109-116）。
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8096
LOG = sys.argv[2] if len(sys.argv) > 2 else ""
BASE = f"http://127.0.0.1:{PORT}"
UPSTREAM = f"{BASE}/upstream"

# 桩收到的请求，供套件断言"上游真的被调用了"（否则一切断言都可能是空转）
SEEN = []
LOCK = threading.Lock()

# 一次成功调用应当落库的用量。刻意用非整数好看的值，避免与"默认 0"混淆。
USAGE = {"prompt_tokens": 35, "completion_tokens": 38, "cached_tokens": 3, "total_tokens": 73}


def catalog():
    """目录投影（catalog/client.go 的 Directory/Model/Template/Channel）。"""
    return {
        "models": [
            {
                "id": "m_stub",
                "channelId": "ch_stub",
                "type": "text",
                "name": "桩模型",
                "providerModel": "stub-model-v1",
                "protocolTemplateId": "tpl_stub",
                "requestPath": "/echo",
                "method": "POST",
                # role=static ⇒ 原样进请求体；model ⇒ 用 providerModel 填
                "params": [
                    {"key": "model", "value": "", "role": "model"},
                    {"key": "prompt", "value": "closure-acceptance", "role": "static"},
                ],
                "capability": {},
            }
        ],
        "templates": [
            {
                "id": "tpl_stub",
                "label": "桩协议",
                "method": "POST",
                "requestPath": "/echo",
                "params": [],
                # ★ 用量路径必须【在这里声明】才会进 Extracted —— 引擎只抽 responseParams 里的键，
                #   而 UsageFromExtracted 正是从 Extracted 里按这些键取值
                #   （判据：engine/usage.go:43-45 找的是 "usage.prompt_tokens" 等）。
                #   我第一版桩没声明它们 ⇒ 端到端跑出 in=0/out=0，看起来像"worker 不落用量"，
                #   实为我的桩根本没把用量抽出来 —— 场景错，不是代码错。
                "responseParams": [
                    {"key": "choices.0.message.content", "value": "", "type": "string", "role": "runtime"},
                    {"key": "usage.prompt_tokens", "value": "", "type": "number", "role": "runtime"},
                    {"key": "usage.completion_tokens", "value": "", "type": "number", "role": "runtime"},
                    {"key": "usage.cached_tokens", "value": "", "type": "number", "role": "runtime"}
                ],
                "async": None,
            }
        ],
        "channels": [{"id": "ch_stub", "kind": "official", "baseUrl": UPSTREAM}],
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # 静音默认日志，改用我们自己的记录
        return

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _record(self, note=""):
        auth = self.headers.get("Authorization", "")
        with LOCK:
            SEEN.append({"method": self.command, "path": self.path,
                         "auth": "Bearer" if auth.startswith("Bearer ") else auth, "note": note})
        line = f"{self.command} {self.path} auth={'yes' if auth else 'no'} {note}"
        print(line, flush=True)
        if LOG:
            with open(LOG, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")

    def do_GET(self):
        self._record()
        p = self.path.split("?")[0]
        if p == "/internal/v1/catalog":
            return self._send(200, catalog())
        if p.endswith("/channels"):
            return self._send(200, {"items": [
                {"id": "ch_stub", "kind": "official", "baseUrl": UPSTREAM, "authType": "bearer"}]})
        if p.endswith("/credentials"):
            return self._send(200, {"items": [
                {"channelId": "ch_stub", "baseUrl": UPSTREAM, "authType": "bearer", "hasKey": True}]})
        if p.endswith("/reveal"):
            # 形状判据：creds/client.go:109-116 ⇒ 引擎从这里拿到真正要用的 baseUrl
            return self._send(200, {"channelId": "ch_stub", "baseUrl": UPSTREAM,
                                    "authType": "bearer", "authHeader": "",
                                    "authPrefix": "", "apiKey": "sk-stub-not-a-real-key"})
        if p == "/__stub/requests":
            with LOCK:
                return self._send(200, {"items": list(SEEN)})
        return self._send(404, {"error": "stub: no such path", "path": p})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {"__unparsed": raw[:200].decode("utf-8", "replace")}
        self._record(note=f"body_keys={sorted(body.keys())}")
        # 假上游：返回带 usage 的响应（引擎从 usage.prompt_tokens 等抽取 ⇒ D4a/D4c）
        return self._send(200, {
            "choices": [{"message": {"role": "assistant", "content": "stub-ok"}}],
            "usage": USAGE,
        })


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"stub 已启动：{BASE}（上游 {UPSTREAM}）", flush=True)
    srv.serve_forever()
