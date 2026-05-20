import { Button, Card, Descriptions, Tag, Typography } from 'antd';
import type { ReadinessStatus } from '../types';

type ReadinessPanelProps = {
  readiness: ReadinessStatus | null;
  onRefresh: () => void;
};

export default function ReadinessPanel({ readiness, onRefresh }: ReadinessPanelProps) {
  if (!readiness) {
    return (
      <Card className="panel-card">
        <Button onClick={onRefresh}>加载准备状态</Button>
      </Card>
    );
  }

  return (
    <Card title="运行准备状态" className="panel-card" extra={<Button onClick={onRefresh}>刷新</Button>}>
      <Descriptions column={3} bordered size="small">
        <Descriptions.Item label="知识库">
          <StatusTag ready={readiness.knowledge.ready} text={readiness.knowledge.label} />
          <Typography.Text type="secondary" className="status-extra">
            {readiness.knowledge.documents} 文档 / {readiness.knowledge.chunks} 片段
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="模型">
          <StatusTag ready={readiness.model.ready} text={readiness.model.label} />
          <Typography.Text type="secondary" className="status-extra">
            {readiness.model.model ?? '未配置'}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="工具">
          <StatusTag ready={readiness.tools.ready} text={readiness.tools.label} />
          <Typography.Text type="secondary" className="status-extra">
            {readiness.tools.items.map((item) => item.name).join(', ')}
          </Typography.Text>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function StatusTag({ ready, text }: { ready: boolean; text: string }) {
  return <Tag color={ready ? 'success' : 'error'}>{text}</Tag>;
}
