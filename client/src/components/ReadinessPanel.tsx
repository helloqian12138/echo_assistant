import { Button, Card, Descriptions, Tag, Typography } from 'antd';
import type { Language, ReadinessStatus } from '../types';

type ReadinessPanelProps = {
  language: Language;
  readiness: ReadinessStatus | null;
  onRefresh: () => void;
};

export default function ReadinessPanel({ language, readiness, onRefresh }: ReadinessPanelProps) {
  const copy = readinessCopy[language];

  if (!readiness) {
    return (
      <Card className="panel-card">
        <Button onClick={onRefresh}>{copy.load}</Button>
      </Card>
    );
  }

  return (
    <Card title={copy.title} className="panel-card" extra={<Button onClick={onRefresh}>{copy.refresh}</Button>}>
      <Descriptions column={3} bordered size="small">
        <Descriptions.Item label={copy.knowledge}>
          <StatusTag ready={readiness.knowledge.ready} text={readiness.knowledge.ready ? copy.ready.knowledge : copy.notReady.knowledge} />
          <Typography.Text type="secondary" className="status-extra">
            {readiness.knowledge.documents} {copy.documents} / {readiness.knowledge.chunks} {copy.chunks}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label={copy.model}>
          <StatusTag ready={readiness.model.ready} text={readiness.model.ready ? copy.ready.model : copy.notReady.model} />
          <Typography.Text type="secondary" className="status-extra">
            {readiness.model.model ?? copy.unconfigured}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label={copy.tools}>
          <StatusTag ready={readiness.tools.ready} text={readiness.tools.ready ? copy.ready.tools : copy.notReady.tools} />
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

const readinessCopy: Record<Language, {
  title: string;
  load: string;
  refresh: string;
  knowledge: string;
  model: string;
  tools: string;
  documents: string;
  chunks: string;
  unconfigured: string;
  ready: {
    knowledge: string;
    model: string;
    tools: string;
  };
  notReady: {
    knowledge: string;
    model: string;
    tools: string;
  };
}> = {
  en: {
    title: 'Runtime readiness',
    load: 'Load readiness',
    refresh: 'Refresh',
    knowledge: 'Knowledge',
    model: 'Model',
    tools: 'Tools',
    documents: 'documents',
    chunks: 'chunks',
    unconfigured: 'Not configured',
    ready: {
      knowledge: 'Knowledge ready',
      model: 'Model ready',
      tools: 'Tools ready'
    },
    notReady: {
      knowledge: 'Knowledge not ready',
      model: 'Model not ready',
      tools: 'Tools not ready'
    }
  },
  zh: {
    title: '运行准备状态',
    load: '加载准备状态',
    refresh: '刷新',
    knowledge: '知识库',
    model: '模型',
    tools: '工具',
    documents: '文档',
    chunks: '片段',
    unconfigured: '未配置',
    ready: {
      knowledge: '知识库已准备',
      model: '模型已准备',
      tools: '工具已准备'
    },
    notReady: {
      knowledge: '知识库未准备',
      model: '模型未准备',
      tools: '工具未准备'
    }
  }
};
