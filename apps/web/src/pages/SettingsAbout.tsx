// EXPORTS: default SettingsAboutPage
// 设置 > 关于（TASK-IA-001 v14 §三）：版本、条款与反馈
import { Info, MessageSquareText, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsAboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-primary" />
            镜序 Studio · 漫剧导演工坊
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">版本 0.1.0</Badge>
            <span>一站式 AI 漫剧 / 短剧 / 影视创作平台</span>
          </div>
          <p>
            从剧本到分镜再到成片的生产链路：漫剧导演工坊、智能创作、模型中心、任务中心。
            设置中心仅承载系统设置；模型配置统一在「模型中心」管理。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            条款与隐私
          </CardTitle>
        </CardHeader>
        <CardContent className="text-2xs text-muted-foreground">
          使用条款、隐私政策与服务协议文档链接将在正式发布时提供。
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquareText className="h-4 w-4 text-primary" />
            反馈
          </CardTitle>
        </CardHeader>
        <CardContent className="text-2xs text-muted-foreground">
          问题反馈与功能建议请通过工作区协作渠道提交；会记录到任务中心供排期评估。
        </CardContent>
      </Card>
    </div>
  );
}
