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
PG_CONTAINER="${PG_CONTAINER:-shotdesigner-postgres-1}"
PG_USER="${PG_USER:-shotdesigner}"
PORT="${SCRATCH_PORT:-8095}"
TOKEN="$(grep -E '^EXECUTION_INTERNAL_TOKEN=' "$ROOT/.env.local" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'[:space:]')"

PASS=0; FAIL=0
ok()   { printf '   ✅ %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '   ❌ %s\n' "$1"; FAIL=$((FAIL+1)); }
q()    { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$SCRATCH_DB" -tA -c "$1" 2>/dev/null | tr -d ' '; }
qfile(){ docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$SCRATCH_DB" -q -f - >/dev/null 2>&1; }
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
echo "── 场景 A：catalog 不可达（迫使 failOrRetry）──────────────"
# ★ 必须把 production 指向【死地址】：
#   否则 cat.Get 会成功、只是模型不在目录里 ⇒ 走的是 Complete(false) 而不是 failOrRetry，
#   于是"重试 / 死信"这两条根本不会被触发（本项目实测踩过：日志里是
#   `job store: Complete … status=failed`，说明压根没进 failOrRetry）。
printf 'EXECUTION_PRODUCTION_URL=http://127.0.0.1:1\n' > /tmp/verdict-deadcatalog.env
SCRATCH_ENV_FILE=/tmp/verdict-deadcatalog.env bash "$SS" up execution "$PORT" >/dev/null 2>&1 || { echo "❌ 无法建立一次性栈"; exit 2; }

# V3 先用：两个任务，一个还会重试、一个已耗尽
seed job_v_retry 1 5
seed job_v_dead  5 5
waitfor "SELECT count(*) FROM jobs WHERE id='job_v_dead' AND dead_lettered_at IS NOT NULL" 30 "死信"
sleep 2

[ "$(q "SELECT status FROM jobs WHERE id='job_v_retry'")" = "queued" ] \
  && ok "V3a 还在重试的任务：job 状态 = queued" || bad "V3a job_v_retry 状态异常：$(q "SELECT status FROM jobs WHERE id='job_v_retry'")"
[ "$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_retry'")" = "queued" ] \
  && ok "V3b 【关键】还在重试 ⇒ 审计【刻意不写】终态（保持 queued）" \
  || bad "V3b 还在重试却写了终态：$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_retry'")"
[ "$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_dead'")" = "failed" ] \
  && ok "V3c 重试耗尽（死信）⇒ 审计写 failed" || bad "V3c 死信未写审计"
[ -n "$(q "SELECT error_message FROM gateway_audit_logs WHERE job_id='job_v_dead'")" ] \
  && ok "V3d 终态带上了真实错误文案" || bad "V3d 终态缺错误文案"

# V1：终态写回本身（payload 为空对象 ⇒ 首次尝试即 "missing modelId" ⇒ Complete 分支）
# ★ 必须【一开始】就是 {}：事后 UPDATE 时任务已进入重试退避，30s 内不会被再处理
cat <<'SQL' | qfile
DELETE FROM gateway_audit_logs WHERE job_id='job_v_terminal';
DELETE FROM job_attempts WHERE job_id='job_v_terminal';
DELETE FROM jobs WHERE id='job_v_terminal';
INSERT INTO jobs (workspace_id,id,idempotency_key,kind,label,created_by,status,attempt,max_attempts,steps,intent_payload)
-- attempt 从 1 起：实测 attempt=0 的任务【不会被 worker 领取】（30s 内状态不变）
VALUES ('ws_dev','job_v_terminal','idem_vt','image','verdict','user_dev','queued',1,5,'[]'::jsonb,'{}'::jsonb);
INSERT INTO gateway_audit_logs (request_id,workspace_id,user_id,product,model_id,channel_id,mode,status,job_id,latency_ms,token_input,token_output,token_cached,cost_amount,cost_currency,created_at)
VALUES ('req_job_v_terminal','ws_dev','user_dev','image','nope','','text-chat','queued','job_v_terminal',0,0,0,0,0,'CNY',now());
SQL
waitfor "SELECT count(*) FROM gateway_audit_logs WHERE job_id='job_v_terminal' AND status<>'queued'" 30 "终态"
[ "$(q "SELECT status FROM gateway_audit_logs WHERE job_id='job_v_terminal'")" != "queued" ] \
  && ok "V1 queued ⇒ 终态（不再是 queued；改动前此路径永不更新）" \
  || bad "V1 审计行仍停在 queued"

# V2：身份不可变 + 完成字段可回填
out="$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$SCRATCH_DB" -tA -c "UPDATE gateway_audit_logs SET request_id='rewritten' WHERE job_id='job_v_terminal';" 2>&1)"
printf '%s' "$out" | grep -q "identity columns are immutable" \
  && ok "V2a 改身份字段(request_id) 被触发器拒绝" || bad "V2a 身份字段竟可改：$out"
out2="$(docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$SCRATCH_DB" -tA -c "UPDATE gateway_audit_logs SET status='success' WHERE job_id='job_v_terminal';" 2>&1)"
printf '%s' "$out2" | grep -q "UPDATE 1" \
  && ok "V2b 回填完成字段(status) 成功" || bad "V2b 完成字段无法回填：$out2"

echo "── 场景 B：开启保留期清理（窗口 1 天 / 间隔 5s）──────────"
bash "$SS" down >/dev/null 2>&1
printf 'EXECUTION_AUDIT_RETENTION_DAYS=1\nEXECUTION_AUDIT_FAILURE_RETENTION_DAYS=1\nEXECUTION_AUDIT_PURGE_INTERVAL=5s\n' > /tmp/verdict-purge.env
SCRATCH_ENV_FILE=/tmp/verdict-purge.env bash "$SS" up execution "$PORT" >/dev/null 2>&1 || { echo "❌ 无法建立清理场景"; exit 2; }

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
