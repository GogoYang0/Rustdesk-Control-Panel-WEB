#!/usr/bin/env bash
# 从 API 仓库的 OpenAPI 契约生成 TypeScript 客户端。
# 用法: bash scripts/gen-api.sh [spec 路径]  （默认 ../rustdesk-control-panel-api/openapi.yaml）
set -euo pipefail

SPEC="${1:-../rustdesk-control-panel-api/openapi.yaml}"

if [ ! -f "$SPEC" ]; then
  echo "spec not found: $SPEC" >&2
  exit 1
fi

pnpm exec openapi-ts -i "$SPEC" -o src/api/generated
