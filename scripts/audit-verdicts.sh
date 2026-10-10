#!/usr/bin/env bash
# ④ 审计能力的【判决套件】——把只能用一次性栈验证的判据变成可重跑的脚本。
#
# 为什么需要它
#   ④ 的机器级判据此前只存在于"某次对话里做过" —— 结论不可复现，也无法在改动后
#   重新确认。本脚本让它们【随时可被判为真或假】。
#
# 覆盖哪几条（其余几条由单测/开发实例覆盖，不在这里重复）
#   V1 worker 终态写回审计（D2/D3）：queued ⇒ failed，且带错误文案
#   V2 身份不可变 + 完成字段可回填（D8a）
#   V3 重试终态（D2b）：还在重试的【保持 queued】；耗尽的【变 failed 且进死信】
#   V4 保留期清理（D6）：超期行被删 · **删除本身留痕** · 哨兵 workspace 不污染租户视图
#
# 不在这里覆盖（如实说明）
#   D4a/D4c（token 落库）需要【真实上游调用】⇒ 会产生费用，故不放进自动套件。
#   D5a（L0 打码）与 D7b（前端统计口径）是纯函数/源码级，已由单测与护栏测试锁定。
#
# 用法：scripts/audit-verdicts.sh      （退出码 0 = 全部判据成立）
set -uo pipefail

# ★ 先把自己所在的目录解析成【绝对路径】，再 cd 到 ROOT。
#   踩过的坑：先 cd "$ROOT" 再用相对的 "$0" ⇒ dirname 解析到了主工作区的 scripts/，
#   于是拿到的是【主工作区的旧版 scratch-stack.sh】（没有 SCRATCH_ENV_FILE），
#   清理场景静默退化成"未启用"，而脚本仍报"跑过了"。
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
cd "$ROOT" || exit 2
SS="$SELF_DIR/scratch-stack.sh"
[ -f "$SS" ] || { echo "❌ 找不到同目录的 scratch-stack.sh：$SS"; exit 2; }
# 断言：用到的能力（SCRATCH_ENV_FILE）必须在【实际使用的】那个脚本里存在 ——
# 否则场景会静默退化，"跑过了"却不代表验过了。
grep -q 'SCRATCH_ENV_FILE' "$SS" || { echo "❌ $SS 不支持 SCRATCH_ENV_FILE（版本过旧）⇒ 场景会静默退化，拒绝继续"; exit 2; }
SCRATCH_DB="${SCRATCH_DB:-execution_verify}"
# 同 scratch-stack.sh：用 ${VAR-}，否则显式设成空字符串会被默认值覆盖（本片真实踩到）
PG_CONTAINER="${PG_CONTAINER-shotdesigner-postgres-1}"
PG_USER="${PG_USER:-shotdesigner}"
PORT="${SCRATCH_PORT:-8095}"
# 口令：环境变量优先（CI），其次 .env.local。
TOKEN="${EXECUTION_INTERNAL_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  TOKEN="$(grep -E '^EXECUTION_INTERNAL_TOKEN=' "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'[:space:]')"
fi

PASS=0; FAIL=0
ok()   { printf '   ✅ %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '   ❌ %s\n' "$1"; FAIL=$((FAIL+1)); }
# ★ 连接方式（docker / 直连 CI service）由 scratch-stack.sh 统一决定，
#   本套件不自己拼连接 —— 否则"两套口径"迟早分叉（本项目已多次踩到）。
q()    { bash "$SS" psql -tA -c "$1" 2>/dev/null | tr -d ' '; }
qfile(){ bash "$SS" psql -q -f - >/dev/null 2>&1; }
waitfor() { # $1=SQL(期望返回非空/non-zero) $2=秒数 $3=说明
  local i; for i in $(seq 1 "$2"); do sleep 1; [ "$(q "$1")" != "0" ] && [ -n "$(q "$1")" ] && return 0; done; return 1
}

seed() { # $1=jobID $2=attempt $3=maxAttempts
  cat <<SQL | qfile
DELETE FROM gateway_audit_logs WHERE job_id='$1';
DELETE FROM job_attempts WHERE job_id='$1';
DELETE FROM jobs WHERE id='$1';
INSERT INTO jobs (workspace_id,id,idempotency_key,kind,label,created_by,status,attempt,max_attempts,steps,intent_payload)
VALUES ('ws_dev','$1','idem_$1','image','verdict','user_dev','queued',$2,$3,'[]'::jsonb,'{"modelId":"nope"}'::jsonb);
INSERT INTO gateway_audit_logs (request_id,workspace_id,user_id,product,model_id,channel_id,mode,status,job_id,latency_ms,token_input,token_output,token_cached,cost_amount,cost_currency,created_at)
VALUES ('req_$1','ws_dev','user_dev','image','nope','','text-chat','queued','$1',0,0,0,0,0,'CNY',now());
SQL
}

echo "════ ④ 审计判决套件 ════"
echo "── 场景 A1：仍在重试（单变量 —— 只播一个任务）────────────"
# ★ 为什么拆成 A1/A2：此前把"还会重试"与"已耗尽"两个任务【同时】播种，
#   于是"仍在重试"的断言与另一个任务的处理进度耦合。实测出现过
#   `attempt=1/500 status=failed`（尝试计数一步没动却是失败态）的怪象，
#   而【完全相同的 fixture 单独跑】逐条正确（worker 日志：第1/2/3次失败 + 5s/11s/23s 退避）。
#   ⇒ 判据必须单变量。产品行为已被日志证明正确，问题在编排。
# ★ 必须同时给出【catalog 与 creds】两侧配置：main.go:69
#   `if catalogClient == nil || credsClient == nil { … }` ⇒ 只给一侧，引擎仍是 nil，
#   任务会在 main.go:229 的守卫处直接 Complete(false)（审计 error_message =
#   "execution engine not configured"），**根本走不到 failOrRetry** —— 本片就是这样
#   在 CI 上连红两轮：本地有 .env.local 把引擎配齐了，CI 没有。
#   两侧都指向死地址，正是场景 A 想要的：跨过守卫、在 catalog 调用处失败 ⇒ failOrRetry。
printf 'EXECUTION_PRODUCTION_URL=http://127.0.0.1:1\nEXECUTION_PRODUCTION_TOKEN=ci-dead\nEXECUTION_WORKSPACE_URL=http://127.0.0.1:1\nEXECUTION_WORKSPACE_TOKEN=ci-dead\n' > /tmp/verdict-deadcatalog.env
setup_log=/tmp/verdict-setup-a1.log
if ! SCRATCH_ENV_FILE=/tmp/verdict-deadcatalog.env bash "$SS" up execution "$PORT" >"$setup_log" 2>&1; then
  echo "❌ 无法建立场景 A1 —— 输出如下（原文）："
  tail -30 "$setup_log" | sed 's/^/      /'
  exit 2
fi
# 日志必须真的有内容：否则"日志里没有该任务"这类判断全是假象（本项目踩过）
if [ ! -s /tmp/scratch-stack.log ]; then
  echo "❌ 场景 A1 的 worker 日志为空或不存在 ⇒ 后续诊断会失真，拒绝继续"
  exit 2
fi

seed job_v_retry 1 500
sleep 10
printf "   （实测）job_v_retry: %s | 审计: %s\n" \
  "$(q "SELECT status||' attempt='||attempt||'/'||max_attempts FROM jobs WHERE id='job_v_retry'")" \
  "$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_retry'")"
retry_status="$(q "SELECT status FROM jobs WHERE id='job_v_retry'")"
retry_attempt="$(q "SELECT attempt FROM jobs WHERE id='job_v_retry'")"
retry_audit="$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_retry'")"
[ "$retry_status" = "queued" ] \
  && ok "V3a 还在重试的任务：job 状态 = queued" \
  || bad "V3a job_v_retry 状态应为 queued，实际 '${retry_status}'"
if [ -n "$retry_attempt" ] && [ "$retry_attempt" -ge 2 ] 2>/dev/null; then
  ok "V3a2 尝试计数确实在推进（attempt=${retry_attempt}）"
else
  bad "V3a2 attempt 未推进（实际 '${retry_attempt}'）⇒ 说明没有走 failOrRetry"
fi
[ "$retry_audit" = "queued" ] \
  && ok "V3b 【关键】还在重试 ⇒ 审计【刻意不写】终态（保持 queued）" \
  || bad "V3b 还在重试却写了终态：'${retry_audit}'"
if [ "$retry_status" != "queued" ] || [ "$retry_audit" != "queued" ]; then
  echo "   —— 诊断（判据：库与 worker 日志原文；以下每一步都不允许中断诊断）——"
  echo "      [1] 任务行："
  q "SELECT id||' attempt='||attempt||'/'||max_attempts||' status='||status FROM jobs WHERE id LIKE 'job_v_%' ORDER BY id" | sed 's/^/         /' || true
  echo "      [2] 审计行（★ error_message 是判定走了哪条分支的关键）："
  q "SELECT job_id||' status='||status||' err='||COALESCE(NULLIF(error_message,''),'(空)') FROM gateway_audit_logs WHERE job_id LIKE 'job_v_%' ORDER BY job_id" | sed 's/^/         /' || true
  echo "      [3] job_attempts："
  q "SELECT COALESCE(string_agg(attempt||':'||status, ' ' ORDER BY attempt), '(无行)') FROM job_attempts WHERE job_id='job_v_retry'" | sed 's/^/         /' || true
  echo "      [4] worker 日志尾部（未过滤，原文）："
  tail -15 /tmp/scratch-stack.log 2>&1 | sed 's/^/         /' || true
  echo "      [5] 实例启动时的配置相关行："
  head -12 /tmp/scratch-stack.log 2>&1 | sed 's/^/         /' || true
fi
bash "$SS" down >/dev/null 2>&1

echo "── 场景 A2：重试耗尽 ⇒ 死信（单变量）＋ V1 终态写回 ─────"
setup_log=/tmp/verdict-setup-a2.log
if ! SCRATCH_ENV_FILE=/tmp/verdict-deadcatalog.env bash "$SS" up execution "$PORT" >"$setup_log" 2>&1; then
  echo "❌ 无法建立场景 A2 —— 输出如下（原文）："
  tail -30 "$setup_log" | sed 's/^/      /'
  exit 2
fi
seed job_v_dead 5 5
if waitfor "SELECT count(*) FROM jobs WHERE id='job_v_dead' AND dead_lettered_at IS NOT NULL" 30 "死信落库"; then
  ok "V3c 重试耗尽：dead_lettered_at 已写入"
else
  bad "V3c 死信超时未落库"
fi
[ "$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_dead'")" = "failed" ] \
  && ok "V3c2 死信 ⇒ 审计写 failed" || bad "V3c2 死信未写审计"
[ -n "$(q "SELECT error_message FROM gateway_audit_logs WHERE job_id='job_v_dead'")" ] \
  && ok "V3d 终态带上了真实错误文案" || bad "V3d 终态缺错误文案"

# V1：终态写回本身（payload 为空对象 ⇒ 首次尝试即 "missing modelId" ⇒ Complete 分支）
cat <<'SQL' | qfile
DELETE FROM gateway_audit_logs WHERE job_id='job_v_terminal';
DELETE FROM job_attempts WHERE job_id='job_v_terminal';
DELETE FROM jobs WHERE id='job_v_terminal';
INSERT INTO jobs (workspace_id,id,idempotency_key,kind,label,created_by,status,attempt,max_attempts,steps,intent_payload)
VALUES ('ws_dev','job_v_terminal','idem_vt','image','verdict','user_dev','queued',1,5,'[]'::jsonb,'{}'::jsonb);
INSERT INTO gateway_audit_logs (request_id,workspace_id,user_id,product,model_id,channel_id,mode,status,job_id,latency_ms,token_input,token_output,token_cached,cost_amount,cost_currency,created_at)
VALUES ('req_job_v_terminal','ws_dev','user_dev','image','nope','','text-chat','queued','job_v_terminal',0,0,0,0,0,'CNY',now());
SQL
waitfor "SELECT count(*) FROM gateway_audit_logs WHERE job_id='job_v_terminal' AND status<>'queued'" 30 "终态写回"
[ "$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_terminal'")" != "queued" ] \
  && ok "V1 queued ⇒ 终态（不再是 queued；改动前此路径永不更新）" \
  || bad "V1 审计行仍停在 queued"

# V2：身份不可变 + 完成字段可回填
out="$(bash "$SS" psql -tA -c "UPDATE gateway_audit_logs SET request_id='rewritten' WHERE job_id='job_v_terminal';" 2>&1)"
printf '%s' "$out" | grep -q "identity columns are immutable" \
  && ok "V2a 改身份字段(request_id) 被触发器拒绝" || bad "V2a 身份字段竟可改：$out"
out2="$(bash "$SS" psql -tA -c "UPDATE gateway_audit_logs SET status='success' WHERE job_id='job_v_terminal';" 2>&1)"
printf '%s' "$out2" | grep -q "UPDATE 1" \
  && ok "V2b 回填完成字段(status) 成功" || bad "V2b 完成字段无法回填：$out2"
echo "── 场景 B：开启保留期清理（窗口 1 天 / 间隔 5s）──────────"
bash "$SS" down >/dev/null 2>&1
printf 'EXECUTION_AUDIT_RETENTION_DAYS=1\nEXECUTION_AUDIT_FAILURE_RETENTION_DAYS=1\nEXECUTION_AUDIT_PURGE_INTERVAL=5s\n' > /tmp/verdict-purge.env
setup_log=/tmp/verdict-setup-b.log
if ! SCRATCH_ENV_FILE=/tmp/verdict-purge.env bash "$SS" up execution "$PORT" >"$setup_log" 2>&1; then
  echo "❌ 无法建立清理场景 —— 输出如下（原文）："
  tail -30 "$setup_log" | sed 's/^/      /'
  exit 2
fi

cat <<'SQL' | qfile
DELETE FROM gateway_audit_logs WHERE request_id LIKE 'req_v4_%';
INSERT INTO gateway_audit_logs (request_id,workspace_id,user_id,product,model_id,channel_id,mode,status,latency_ms,token_input,token_output,token_cached,cost_amount,cost_currency,created_at)
VALUES
 ('req_v4_old_a','ws_dev','u','image','m','','probe','success',1,0,0,0,0,'CNY', now() - interval '3 days'),
 ('req_v4_old_b','ws_dev','u','image','m','','probe','failed', 1,0,0,0,0,'CNY', now() - interval '3 days'),
 ('req_v4_fresh','ws_dev','u','image','m','','probe','success',1,0,0,0,0,'CNY', now());
SQL
waitfor "SELECT count(*) FROM gateway_audit_logs WHERE mode='audit_purge'" 40 "清理记录"

[ "$(q "SELECT count(*) FROM gateway_audit_logs WHERE request_id LIKE 'req_v4_%'")" = "1" ] \
  && ok "V4a 超期 2 行被删、新行保留" || bad "V4a 删除结果异常：剩 $(q "SELECT count(*) FROM gateway_audit_logs WHERE request_id LIKE 'req_v4_%'") 行"
[ "$(q "SELECT count(*) FROM gateway_audit_logs WHERE mode='audit_purge'")" -ge 1 ] \
  && ok "V4b 【关键】删除本身留痕（mode=audit_purge）" || bad "V4b 删除未留痕"
[ "$(q "SELECT workspace_id FROM gateway_audit_logs WHERE mode='audit_purge' ORDER BY id DESC LIMIT 1")" = "__system__" ] \
  && ok "V4c 清理记录归属哨兵 workspace=__system__" || bad "V4c 归属异常"
if [ -n "$TOKEN" ]; then
  cnt="$(curl -s "http://127.0.0.1:$PORT/internal/v1/audit/logs?limit=50" -H "Authorization: Bearer $TOKEN" -H 'X-Workspace-Id: ws_dev' -H 'X-Actor-Id: user_dev' | python3 -c "import sys,json;d=json.load(sys.stdin);print(sum(1 for i in d['items'] if i.get('mode')=='audit_purge'))" 2>/dev/null)"
  [ "${cnt:-1}" = "0" ] && ok "V4d 【关键】哨兵记录不出现在租户视图（ws_dev 列表）" || bad "V4d 哨兵记录泄漏到租户视图：$cnt"
else
  echo "   ⚠️  取不到内部 token ⇒ V4d 未验证"
fi

echo "── 清理 ────────────────────────────────────────────────"
bash "$SS" down >/dev/null 2>&1
rm -f /tmp/verdict-purge.env /tmp/verdict-deadcatalog.env

echo
echo "════ 结论：通过 $PASS 项 / 失败 $FAIL 项 ════"
[ "$FAIL" -eq 0 ] || exit 1
