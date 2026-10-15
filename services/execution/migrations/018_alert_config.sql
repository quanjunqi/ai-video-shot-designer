-- 018: 最小告警配置表（TASK-OBS-002 / dev-plan T11）
--
-- 背景：T11 三类最小告警（错误率突增 / 熔断发生 / 同步失败 → webhook）需要配置。
-- 不引入独立告警服务（P1 外）：webhook 用简单 POST + 3 次重试上限（task 卡 §6 约束）。
--
-- 设计：
--   · 一行 = 一个 workspace 的告警配置（workspace_id 唯一键，单租户单配置，够用且最简）
--   · enabled       ：总开关（运营可一键关闭全部告警，与 breaker.Disabled 同思路）
--   · error_rate_threshold_pct：错误率突增阈值（0-100，默认 20）
--   · error_rate_window_min   ：错误率滚动窗口（分钟，默认 5）
--   · cooldown_min            ：触发后冷却（分钟，默认 10；同一配置冷却期内不重复发）
--   · webhook_url   ：接收地址（必填；enabled 时校验非空）
--   · last_triggered_at：上次 webhook 触发时间（冷却去重依据）
--   · 熔断发生 / 同步失败两类告警复用同一 webhook_url 与冷却（最小实现，不细分每条规则）
--
-- fail-open 语义（与 breaker/budget 一致）：配置读不到/DB 故障 ⇒ 不告警不阻断主流程。

CREATE TABLE IF NOT EXISTS alert_config (
    workspace_id             text PRIMARY KEY,
    enabled                  boolean NOT NULL DEFAULT true,
    error_rate_threshold_pct numeric(5,2) NOT NULL DEFAULT 20.00
        CHECK (error_rate_threshold_pct > 0 AND error_rate_threshold_pct <= 100),
    error_rate_window_min    integer NOT NULL DEFAULT 5
        CHECK (error_rate_window_min > 0 AND error_rate_window_min <= 1440),
    cooldown_min             integer NOT NULL DEFAULT 10
        CHECK (cooldown_min > 0 AND cooldown_min <= 1440),
    webhook_url              text NOT NULL DEFAULT '',
    last_triggered_at        timestamptz,
    updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE alert_config IS
    'T11 最小告警配置（错误率突增/熔断发生/同步失败 → webhook）。workspace_id 唯一键，'
    '单租户单配置；enabled=false 一键关闭；webhook POST+3 重试（无独立告警服务）。'
    '读取 fail-open：配置缺失/DB 故障不告警不阻断。';

COMMENT ON COLUMN alert_config.error_rate_threshold_pct IS
    '错误率突增阈值（0-100，默认 20）：滚动窗口内失败调用占比超阈值且窗口内调用数>0 触发。';

COMMENT ON COLUMN alert_config.error_rate_window_min IS
    '错误率滚动窗口（分钟，默认 5）：以最近 N 分钟审计行为评估窗口。';

COMMENT ON COLUMN alert_config.cooldown_min IS
    '触发冷却（分钟，默认 10）：距 last_triggered_at 不足冷却期不重复触发（防抖）。';

COMMENT ON COLUMN alert_config.last_triggered_at IS
    '上次 webhook 触发时间（冷却去重依据，跨副本共享——多实例不会重复发）。';
