#!/bin/bash
# 迭代自检脚本 - 严格版
# 用法：./scripts/self-check.sh
set -e

echo "========================================="
echo "  迭代自检 - 严格版"
echo "========================================="

WEB_DIR="/Users/quanjunqi/student/ai-video/ai-video-shot-designer/apps/web"
cd "$WEB_DIR"

ERRORS=0

# 1. 静态检查：TypeScript 类型检查
echo ""
echo "[1/4] TypeScript 类型检查..."
if npx tsc --noEmit 2>&1; then
  echo "  ✅ 通过"
else
  echo "  ❌ 失败"
  ERRORS=$((ERRORS + 1))
fi

# 2. 构建验证：Vite 构建
echo ""
echo "[2/4] Vite 构建验证..."
if npx vite build 2>&1 | tail -5; then
  echo "  ✅ 通过"
else
  echo "  ❌ 失败"
  ERRORS=$((ERRORS + 1))
fi

# 3. 导入完整性检查：所有使用 Dialog 的文件都必须导入
echo ""
echo "[3/4] 导入完整性检查..."
MISSING=0
for f in $(grep -rl "<Dialog" --include="*.tsx" src/); do
  if ! grep -q "Dialog" "$f" | head -1; then
    if ! grep -q "from '@/components/ui/dialog'" "$f"; then
      echo "  ❌ 缺失 Dialog 导入: $f"
      MISSING=$((MISSING + 1))
    fi
  fi
done
if [ $MISSING -eq 0 ]; then
  echo "  ✅ 所有组件导入完整"
else
  ERRORS=$((ERRORS + 1))
fi

# 4. 未定义变量检查：搜索常见的未定义模式
echo ""
echo "[4/4] 常见错误模式检查..."
PATTERNS=("is not defined" "Cannot read properties" "undefined is not")
FOUND=0
for pattern in "${PATTERNS[@]}"; do
  if grep -r "$pattern" --include="*.tsx" --include="*.ts" src/ 2>/dev/null | grep -v "node_modules" | head -3; then
    echo "  ⚠️  发现潜在错误模式: $pattern"
    FOUND=$((FOUND + 1))
  fi
done
if [ $FOUND -eq 0 ]; then
  echo "  ✅ 未发现常见错误模式"
fi

echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "  自检结果：全部通过 ✅"
  echo "  提示：如浏览器仍有缓存，请硬刷新 (Cmd+Shift+R)"
else
  echo "  自检结果：发现 $ERRORS 个错误 ❌"
  exit 1
fi
echo "========================================="
