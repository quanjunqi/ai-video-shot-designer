---
taskId: TASK-PROC-008
status: 待验收
priority: **P1（清零基线 ⇒ BE-SIZE-001 全面阻断）**
pr: "#<待开>"
criteria: 8
criteriaPassed: 8
depends_on: TASK-PROC-005（棘轮）、TASK-PROC-006（装配搬移）、TASK-PROC-007（handler 拆分）
---

# TASK-PROC-008：清零文件行数基线（engine.go 孤立注释 + 4 个测试文件拆分）

## 范围依据（TASK-PROC-005 基线剩余 5 项）

| 行数 | 文件 | 手法 |
|---|---|---|
| **526** | `services/execution/internal/engine/engine.go` | **清孤立注释**（实测 410-444 + 452-526 共 **110 行 0 代码**）⇒ 降到 ~416 |
| 764 | `services/web-bff/internal/httpserver/main_test.go` | 按域拆测试 |
| 745 | `services/execution/internal/engine/request_template_test.go` | 按域拆测试 |
| 659 | `services/production/internal/catalog/protocol_registry_test.go` | 按域拆测试 |
| 550 | `services/execution/internal/engine/engine_test.go` | 按域拆测试 |

**做完整张卡 ⇒ 基线清零 ⇒ 该规则从"存量豁免"变为"全面阻断"**（同 `ui-text-debt-baseline.json` 的终态约定）。

## 为什么把 engine.go 与 4 个测试文件放同一张卡

它们**同属"清零基线"这一个目标**，且手法一致（清理死内容 / 按域拆分），
拆成两张卡会让"基线是否清零"这个验收点跨卡，反而更难判定。

## ⚠️ engine.go 必须先验证再删

清孤立注释前**必须验证副本存在**（同 TASK-PROC-007 的做法）：逐条检查每条注释是否在
同包其它文件中出现；**找不到副本的必须保留或搬回其函数处**，不得直接删。

## 验收标准

1. 五个文件**均 ≤ 500 行**（`engine.go` ≤500、四个测试文件 ≤500）
2. 拆分/清理产生的每个新文件**也 ≤ 500 行**
3. `bash scripts/check-file-size.sh` **rc=0**
4. **基线清零**：`.github/file-size-baseline.txt` 只剩注释、**0 条登记**
   ⇒ 此后新增任何超限文件都 **直接阻断**（无豁免可加）
5. **`--self-test` 仍全绿**（7 例：5 反例 + 2 正例）—— 证明清零后门禁依然会红
6. 三服务 `go build && go test -race && go vet` 全绿，且**整链 `audit-verdicts.sh` 维持 20 通过 / 0 失败 / EXIT=0**
7. **测试零丢失**：整包 `func Test*` 名字集合与拆分前**逐条相同**（同 PROC-007 判据 7 的强化做法）
8. `gofmt -l` 干净；台账 + CHANGELOG 同步

## 非范围

- ❌ 不改任何测试断言、被测逻辑、错误码
- ❌ 不调阈值
- ❌ 不为"减少行数"删掉任何断言（测试文件拆分的唯一合法手法是**搬移**）

## 附：立卡依据（可复现）

```bash
bash scripts/check-file-size.sh        # 剩余 5 项
python3 - <<'PY'                      # engine.go 的纯注释块
import pathlib
L=pathlib.Path('services/execution/internal/engine/engine.go').read_text().splitlines()
s=None
for i,l in enumerate(L):
    e=(not l.strip()) or l.strip().startswith('//')
    if e and s is None: s=i
    if not e and s is not None:
        if i-s>=25: print(f'  纯注释块 行 {s+1}-{i}（{i-s} 行）')
        s=None
PY
```
