import { Badge } from '@/components/ui/badge';
import type { ModelParam, ProtocolAsync } from '@/config/models/model-catalog';

/** 协议请求预览：把 渠道 BaseURL + 协议/模型 的 method/requestPath/请求参数/响应映射
 *  渲染为真实请求形态（URL / Headers / Body / 响应解析）。
 *  参数按来源三分类渲染：static 显示默认值；model 显示模型注入值（providerModel）；
 *  runtime 显示构造占位（执行器按业务输入生成）。纯展示组件，不发起请求；Key 一律打码。 */
function formatStaticValue(raw: string): string {
  if (/^[\d.]+$/.test(raw)) return raw;
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase();
  if (/^[[{]/.test(raw)) {
    try {
      return JSON.stringify(JSON.parse(raw));
    } catch {
      return JSON.stringify(raw);
    }
  }
  return JSON.stringify(raw);
}

export function ProtocolPreview({
  baseUrl,
  authType,
  method,
  requestPath,
  params,
  responseParams,
  async,
  providerModel,
}: {
  baseUrl: string;
  authType: 'bearer' | 'none' | string;
  method: string;
  requestPath: string;
  params: ModelParam[];
  responseParams: ModelParam[];
  async?: ProtocolAsync;
  providerModel?: string;
}) {
  const base = (baseUrl || '').trim().replace(/\/+$/, '');
  const path = (requestPath || '').trim();
  const url = base ? base + (path.startsWith('/') ? path : path ? `/${path}` : '') : path.startsWith('/') ? path : path ? `/${path}` : '';
  const hasParams = params.some((p) => p.key.trim());

  // 按来源分类渲染 Body：static 真值（模型覆盖以「模型覆盖」标注）/ model 注入 / runtime 占位说明
  const bodyLines = hasParams
    ? params.filter((p) => p.key.trim()).map((p) => {
        const role = p.role ?? 'static';
        if (role === 'model') {
          const val = providerModel || `<模型标识 ${p.key}>`;
          return `  "${p.key}": ${JSON.stringify(val)} // ← ${p.desc ?? '模型身份注入'}`;
        }
        if (role === 'runtime') {
          const placeholder = p.key === 'messages'
            ? '<对话消息数组：系统提示词 + 用户内容，执行器按业务构造>'
            : `<${p.desc ?? `${p.key} 由执行器按业务构造`}>`;
          return `  "${p.key}": ${placeholder} // ${p.type ?? ''}`;
        }
        return p.overridden
          ? `  "${p.key}": ${formatStaticValue(p.value)} // 模型覆盖默认值`
          : `  "${p.key}": ${formatStaticValue(p.value)} // 静态默认`;
      })
    : ['  {}'];

  return (
    <div className="space-y-3">
      {async?.enabled && (
        <div>
          <p className="text-4xs uppercase tracking-wide text-muted-foreground">异步任务流程</p>
          <div className="mt-1 space-y-1 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2 font-mono text-2xs leading-5">
            <div><span className="text-muted-foreground">提交</span> → 取 <span className="text-primary">{async.taskIdField || 'task_id'}</span></div>
            <div><span className="text-muted-foreground">轮询</span> <span className="text-primary">{async.statusField || 'status'}</span>：</div>
            <div>
              <span className="text-muted-foreground">轮询地址</span>{' '}
              {async.pollPath ? (
                <span className="font-mono text-primary">{async.pollPath}</span>
              ) : (
                <span className="text-destructive">未声明 → 执行器将退化到 /v1/images/tasks/{'{'}task_id{'}'}（对多数渠道是错的）</span>
              )}
            </div>
            <div className="pl-3 text-success">= {async.doneValue || 'SUCCESS'} → 完成，按响应映射取成品（间隔/超时由执行器内置）</div>
            <div className="pl-3 text-destructive">= {async.failValue || 'FAILED'} → 失败，取错误信息</div>
          </div>
        </div>
      )}
      {/* 请求行 */}
      <div>
        <p className="text-4xs uppercase tracking-wide text-muted-foreground">请求</p>
        <div className="mt-1 overflow-x-auto rounded-md border bg-muted/40 px-2.5 py-2">
          <code className="whitespace-nowrap text-2xs">
            <Badge variant="outline" className="mr-1.5 h-4 px-1 font-mono text-4xs text-primary">{method}</Badge>
            <span className="font-mono text-foreground">{url || '（未配置请求路径）'}</span>
            {!base && <span className="font-mono text-muted-foreground">{' '}← 渠道 BaseURL + 请求路径</span>}
          </code>
        </div>
      </div>
      {/* Headers */}
      <div>
        <p className="text-4xs uppercase tracking-wide text-muted-foreground">Headers</p>
        <div className="mt-1 overflow-x-auto rounded-md border bg-muted/40 px-2.5 py-2">
          <code className="block whitespace-nowrap text-2xs">
            {authType === 'none'
              ? <><span className="font-mono text-muted-foreground">Content-Type: </span><span className="font-mono">application/json</span></>
              : <><span className="font-mono text-muted-foreground">Authorization: </span><span className="font-mono">Bearer sk-********（实际请求注入加密存储的 Key）</span><br />
                 <span className="font-mono text-muted-foreground">Content-Type: </span><span className="font-mono">application/json</span></>}
          </code>
        </div>
      </div>
      {/* Body */}
      <div>
        <p className="text-4xs uppercase tracking-wide text-muted-foreground">Body</p>
        <div className="mt-1 overflow-x-auto rounded-md border bg-muted/40 px-2.5 py-2">
          <pre className="font-mono text-2xs leading-5 text-foreground">{`{\n${bodyLines.join(',\n')}\n}`}</pre>
        </div>
        {!hasParams && <p className="mt-1 text-3xs text-muted-foreground">无请求参数，执行器将按 provider 内置字段构造。</p>}
        <p className="mt-1 text-4xs text-muted-foreground">
          来源：<span className="text-zinc-400">静态默认</span>（模板存值）· <span className="text-primary">模型注入</span>（providerModel）· <span className="text-violet-400">运行时注入</span>（执行器按业务构造）
        </p>
      </div>
      {/* 响应解析 */}
      <div>
        <p className="text-4xs uppercase tracking-wide text-muted-foreground">响应解析</p>
        <div className="mt-1 rounded-md border bg-muted/40 px-2.5 py-2">
          {responseParams.length > 0 ? (
            <div className="space-y-1">
              {responseParams.filter((p) => p.key.trim()).map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-2xs">
                  <code className="font-mono text-primary">{p.key}</code>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-muted-foreground">{p.value || '提取该字段'}</span>
                  {p.type && <Badge className={`h-4 px-1 font-mono text-4xs ${p.type === 'array' ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'bg-zinc-500/10 text-zinc-400'}`}>{p.type}</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-2xs text-muted-foreground">按已知 provider 内置解析（如 OpenAI 兼容取 choices.0.message.content）。</p>
          )}
        </div>
      </div>
      <p className="text-4xs text-muted-foreground">预览仅为请求形态示意，Key 已打码；实际执行由 execution 服务注入凭据后发送。</p>
    </div>
  );
}
