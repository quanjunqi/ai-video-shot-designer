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
#   V5 真实调用链（D4a/D4c + 终态词 + 耗时）：catalog → 凭据 → 上游 → usage → 审计 → 聚合
#      ★ 上游换成本地桩（scripts/stub-upstream.py）⇒ 不花钱、可复现，仍然走完整链路
#   V6 私网防护（netguard）：默认拒绝，且拒绝本身如实留痕
#
# 不在这里覆盖（如实说明）
#   D5a（L0 打码）与 D7b（前端统计口径）是纯函数/源码级，已由单测与护栏测试锁定。
#   （D4a/D4c 原先因"需要真实上游调用、会产生费用"而不覆盖 —— 本地桩消除了这个理由。）
#
# 用法：scripts/audit-verdicts.sh      （退出码 0 = 全部判据成立）
set -uo pipefail

# ★ 先把自己所在的目录解析成【绝对路径】，再 cd 到 ROOT。
#   踩过的坑：先 cd "$ROOT" 再用相对的 "$0" ⇒ dirname 解析到了主工作区的 scripts/，
#   于是拿到的是【主工作区的旧版 scratch-stack.sh】（没有 SCRATCH_ENV_FILE），
#   清理场景静默退化成"未启用"，而脚本仍报"跑过了"。
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# ★ 与 scratch-stack.sh 同族：不能用"worktree 列表第一项"（那总是主 checkout）。
#   本脚本所在的树才是"这次要验的代码"。.env.local 单独回退主 checkout。
ROOT="$(cd "$SELF_DIR/.." && pwd)"
MAIN_ROOT="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
cd "$ROOT" || exit 2
SS="$SELF_DIR/scratch-stack.sh"
[ -f "$SS" ] || { echo "❌ 找不到同目录的 scratch-stack.sh：$SS"; exit 2; }
# 断言：用到的能力（SCRATCH_ENV_FILE）必须在【实际使用的】那个脚本里存在 ——
# 否则场景会静默退化，"跑过了"却不代表验过了。
grep -q 'SCRATCH_ENV_FILE' "$SS" || { echo "❌ $SS 不支持 SCRATCH_ENV_FILE（版本过旧）⇒ 场景会静默退化，拒绝继续"; exit 2; }
SCRATCH_DB="${SCRATCH_DB:-execution_verify}"
# ★ 连接方式由 scratch-stack.sh 统一决定，本套件**不再自己猜**。
#
#   这里原来写的是 `PG_CONTAINER="${PG_CONTAINER-shotdesigner-postgres-1}"` ——
#   把容器名当默认值 ⇒ **CI（没有这个容器）被强行拉进 docker 模式**，报
#     `Error response from daemon: No such container: shotdesigner-postgres-1`
#   而本地因为容器确实在，看不出差异。典型的"在我机器上能跑"。
#   现在与 scratch-stack.sh 保持一致：默认**空** ⇒ 直连（CI 的 Postgres service 场景）。
# ★ 必须 **export**：下面所有 `bash "$SS" ...` 都是【子进程】，
#   不导出的话子进程看不到这个（可能为空的）值，会用它自己的默认值（容器名）
#   ⇒ 又回到 docker 模式。本片真实踩到：套件打印"直连"，而 A1 的 setup 输出 docker。
PG_CONTAINER="${PG_CONTAINER-}"
export PG_CONTAINER
PG_USER="${PG_USER:-shotdesigner}"
PORT="${SCRATCH_PORT:-8095}"
# 口令：环境变量优先（CI），其次 .env.local。
TOKEN="${EXECUTION_INTERNAL_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  for cand in "$ROOT/.env.local" "$MAIN_ROOT/.env.local"; do
    [ -f "$cand" ] || continue
    TOKEN="$(grep -E '^EXECUTION_INTERNAL_TOKEN=' "$cand" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'[:space:]')"
    [ -n "$TOKEN" ] && break
  done
fi

# 把实际连接模式说出来：这类"连错了地方"的错误，只有说出来才不会重演
if [ -n "$PG_CONTAINER" ]; then
  echo "── 连接方式：docker（容器 ${PG_CONTAINER}）──"
else
  echo "── 连接方式：直连（PG_CONTAINER 为空；由 EXECUTION_DATABASE_URL 推导）──"
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
# ★ 自证：实例【实际看到的】引擎配置。main.go:69 要求 catalog 与 creds 两侧都非 nil，
#   否则引擎保持 nil ⇒ 任务在 main.go:229 直接 Complete(false)，永远走不到 failOrRetry。
#   此前套件从不检查这一点，于是 CI 里"引擎没配起来"被表现成"判据失败"（红了一轮又一轮）。
assert_engine_configured() {
  local log=/tmp/scratch-stack.log
  if grep -q "execution engine partial config" "$log"; then
    echo "❌ 实例的执行引擎【未构建】—— 启动日志原文："
    grep -E "partial config|channel probe disabled" "$log" | sed 's/^/      /'
    echo "   ⇒ 判据会全部失真（任务在第一道守卫就失败）。请检查 env file 是否真的生效。"
    return 1
  fi
  grep -E "channel probe|worker 并发上限" "$log" | head -2 | sed 's/^/      （引擎就绪：/;s/$/）/' || true
  return 0
}

setup_log=/tmp/verdict-setup-a1.log
if ! SCRATCH_ENV_FILE=/tmp/verdict-deadcatalog.env bash "$SS" up execution "$PORT" >"$setup_log" 2>&1; then
  echo "❌ 无法建立场景 A1 —— 输出如下（原文）："
  tail -30 "$setup_log" | sed 's/^/      /'
  exit 2
fi
assert_engine_configured || { bad "场景 A1：实例引擎未构建（见上）"; exit 2; }
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
assert_engine_configured || { bad "场景 A2：实例引擎未构建（见上）"; exit 2; }
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

echo "── 场景 C（V5）：真实调用（本地桩）⇒ 终态词 / 用量 / 耗时 ──────"
# 为什么能用"真实调用"做判据而不花钱：桩把上游换成本地进程，
# execution 仍走完整链路（解析目录 → reveal 凭据 → 发 HTTP → 抽 usage → 写审计）。
bash "$SS" down >/dev/null 2>&1
STUB_PORT="${STUB_PORT:-8096}"
STUB_LOG=/tmp/verdict-stub.log
rm -f "$STUB_LOG"
python3 "$SELF_DIR/stub-upstream.py" "$STUB_PORT" "$STUB_LOG" >/tmp/verdict-stub.out 2>&1 &
STUB_PID=$!
trap 'kill "$STUB_PID" 2>/dev/null || true' EXIT
stub_ready=0
for _ in $(seq 1 20); do
  if curl -sf -o /dev/null "http://127.0.0.1:${STUB_PORT}/internal/v1/catalog"; then stub_ready=1; break; fi
  sleep 0.5
done
if [ "$stub_ready" != "1" ]; then
  echo "❌ 桩未就绪 —— 输出如下（原文）："; tail -20 /tmp/verdict-stub.out | sed 's/^/      /'; exit 2
fi
# ★ 只对本地桩显式放行环回/私网：netguard 默认拒绝（V6 就是验那一半）
cat > /tmp/verdict-stub.env <<ENVEOF
export EXECUTION_PRODUCTION_URL=http://127.0.0.1:${STUB_PORT}
export EXECUTION_PRODUCTION_TOKEN=stub-token
export EXECUTION_WORKSPACE_URL=http://127.0.0.1:${STUB_PORT}
export EXECUTION_WORKSPACE_TOKEN=stub-token
export EXECUTION_ALLOW_PRIVATE_UPSTREAM=1
ENVEOF
setup_log=/tmp/verdict-setup-c.log
if ! SCRATCH_ENV_FILE=/tmp/verdict-stub.env bash "$SS" up execution "$PORT" >"$setup_log" 2>&1; then
  echo "❌ 无法建立真实调用场景 —— 输出如下（原文）："; tail -30 "$setup_log" | sed 's/^/      /'; exit 2
fi
assert_engine_configured || { bad "场景 C：实例引擎未构建（见上）"; }

cat <<'SQL' | qfile
DELETE FROM gateway_audit_logs WHERE job_id='job_v_stub';
DELETE FROM job_attempts WHERE job_id='job_v_stub';
DELETE FROM jobs WHERE id='job_v_stub';
INSERT INTO jobs (workspace_id,id,idempotency_key,kind,label,created_by,status,attempt,max_attempts,steps,intent_payload)
VALUES ('ws_dev','job_v_stub','idem_job_v_stub','image','verdict','user_dev','queued',1,1,'[]'::jsonb,'{"modelId":"m_stub"}'::jsonb);
INSERT INTO gateway_audit_logs (request_id,workspace_id,user_id,product,model_id,channel_id,mode,status,job_id,latency_ms,token_input,token_output,token_cached,cost_amount,cost_currency,created_at)
VALUES ('req_job_v_stub','ws_dev','user_dev','image','m_stub','ch_stub','text-chat','queued','job_v_stub',0,0,0,0,0,'CNY',now());
SQL

waitfor "SELECT count(*) FROM jobs WHERE id='job_v_stub' AND status IN ('succeeded','failed')" 45 "任务终态"

# V5a 终态词：必须与【读者】一致（同步路径/契约/前端都认 success）
st="$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_stub'")"
[ "$st" = "success" ] && ok "V5a 审计终态词为 success（与同步路径/契约/前端一致）" \
  || bad "V5a 审计终态词异常：'$st'（若为 succeeded ⇒ 异步成功不计入成功率）"

# V5b 用量：D4a/D4c 在【异步】路径上的判据（此前套件明确不覆盖）
# ★ 不能靠空格分隔：q() 用 `tr -d ' '` 去空白，三个值会被粘成一个（本片真实踩到）
tin="$(q "SELECT token_input FROM gateway_audit_logs WHERE job_id='job_v_stub'")"
tout="$(q "SELECT token_output FROM gateway_audit_logs WHERE job_id='job_v_stub'")"
tcac="$(q "SELECT token_cached FROM gateway_audit_logs WHERE job_id='job_v_stub'")"
[ "$tin" = "35" ] && [ "$tout" = "38" ] && [ "$tcac" = "3" ] \
  && ok "V5b 【关键】真实调用的用量落库（in=35 out=38 cached=3）" \
  || bad "V5b 用量异常：in=${tin} out=${tout} cached=${tcac}（桩响应 usage 与实际不符？）"

# V5c 耗时：曾硬编码 0 ⇒ 异步长任务被整体排除在 P50/P95 之外
lat="$(q "SELECT latency_ms FROM gateway_audit_logs WHERE job_id='job_v_stub'")"
[ "${lat:-0}" -gt 0 ] 2>/dev/null && ok "V5c 耗时落库（latency_ms=${lat}，异步任务不再恒 0）" \
  || bad "V5c 耗时仍为 0 ⇒ 异步任务会被排除在耗时分布之外"

# V5d 上游真的被调用过（否则上面几条可能只是播种的数据）
grep -q 'POST /upstream/echo' "$STUB_LOG" 2>/dev/null && ok "V5d 上游确实被调用（桩日志有 POST /upstream/echo）" \
  || bad "V5d 桩日志里没有上游调用记录"

# V5e 聚合能看到这次调用（服务端口径）
if [ -n "$TOKEN" ]; then
  curl -s "http://127.0.0.1:$PORT/internal/v1/audit/logs?limit=1" -H "Authorization: Bearer $TOKEN" \
       -H 'X-Workspace-Id: ws_dev' -H 'X-Actor-Id: user_dev' > /tmp/verdict-stats.json
  # ★ 数值比较放在 python 里：Go 把 1.0 序列化成 1，用字符串比 "1.0" 会假失败（本片真实踩到）
  verdict="$(python3 -c "
import json
d=json.load(open('/tmp/verdict-stats.json')); s=d.get('stats') or {}
tm=(s.get('tokensByModel') or [{}])
succ=s.get('success'); rate=s.get('successRate'); inp=(tm[0] if tm else {}).get('input')
ok = succ==1 and abs((rate or 0)-1.0)<1e-9 and inp==35
print(('ok' if ok else 'bad') + f' success={succ} rate={rate} tokensByModel.input={inp}')" 2>/dev/null)"
  case "$verdict" in
    ok\ *) ok "V5e 聚合口径一致（${verdict#ok }）" ;;
    *)     bad "V5e 聚合异常：${verdict#bad }" ;;
  esac
else
  echo "   ⚠️  取不到内部 token ⇒ V5e 未验证"
fi

echo "── 场景 D（V6）：私网防护默认开启 ⇒ 被拒且如实留痕 ──────────"
# 不放行环回 ⇒ 引擎应在最后一跳被 netguard 拒绝，并把失败写进审计（故障定位的实证）
bash "$SS" down >/dev/null 2>&1
cat > /tmp/verdict-stub-blocked.env <<ENVEOF
export EXECUTION_PRODUCTION_URL=http://127.0.0.1:${STUB_PORT}
export EXECUTION_PRODUCTION_TOKEN=stub-token
export EXECUTION_WORKSPACE_URL=http://127.0.0.1:${STUB_PORT}
export EXECUTION_WORKSPACE_TOKEN=stub-token
ENVEOF
setup_log=/tmp/verdict-setup-d.log
if ! SCRATCH_ENV_FILE=/tmp/verdict-stub-blocked.env bash "$SS" up execution "$PORT" >"$setup_log" 2>&1; then
  echo "❌ 无法建立防护场景 —— 输出如下（原文）："; tail -30 "$setup_log" | sed 's/^/      /'; exit 2
fi
cat <<'SQL' | qfile
DELETE FROM gateway_audit_logs WHERE job_id='job_v_blocked';
DELETE FROM job_attempts WHERE job_id='job_v_blocked';
DELETE FROM jobs WHERE id='job_v_blocked';
INSERT INTO jobs (workspace_id,id,idempotency_key,kind,label,created_by,status,attempt,max_attempts,steps,intent_payload)
VALUES ('ws_dev','job_v_blocked','idem_job_v_blocked','image','verdict','user_dev','queued',1,1,'[]'::jsonb,'{"modelId":"m_stub"}'::jsonb);
INSERT INTO gateway_audit_logs (request_id,workspace_id,user_id,product,model_id,channel_id,mode,status,job_id,latency_ms,token_input,token_output,token_cached,cost_amount,cost_currency,created_at)
VALUES ('req_job_v_blocked','ws_dev','user_dev','image','m_stub','ch_stub','text-chat','queued','job_v_blocked',0,0,0,0,0,'CNY',now());
SQL
waitfor "SELECT count(*) FROM jobs WHERE id='job_v_blocked' AND status IN ('succeeded','failed')" 45 "防护场景终态"
q "SELECT error_message FROM gateway_audit_logs WHERE job_id='job_v_blocked'" | grep -q 'netguard' \
  && ok "V6a 【关键】私网地址被 netguard 拒绝（防护默认开启）" \
  || bad "V6a 未看到 netguard 拒绝：$(q "SELECT left(error_message,120) FROM gateway_audit_logs WHERE job_id='job_v_blocked'")"
[ "$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_blocked'")" = "failed" ] \
  && ok "V6b 被拒后终态为 failed，且审计如实留痕（故障定位）" || bad "V6b 防护场景终态异常"

echo "── 清理 ────────────────────────────────────────────────"
bash "$SS" down >/dev/null 2>&1
kill "${STUB_PID:-0}" 2>/dev/null || true
rm -f /tmp/verdict-purge.env /tmp/verdict-deadcatalog.env /tmp/verdict-stub.env /tmp/verdict-stub-blocked.env

echo
echo "════ 结论：通过 $PASS 项 / 失败 $FAIL 项 ════"
[ "$FAIL" -eq 0 ] || exit 1
