import { Card, Descriptions, Divider, List, Space, Tag, Typography } from 'antd';
import type { ChatResponse, Language } from '../types';

export default function AgentTrace({ language, result }: { language: Language; result: ChatResponse }) {
  const copy = traceCopy[language];

  return (
    <Card title={copy.title} className="panel-card">
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Session">{result.memory.sessionId}</Descriptions.Item>
        <Descriptions.Item label="Turns">{result.memory.turns}</Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">{copy.toolCalls}</Divider>
      <List
        bordered
        dataSource={result.toolCalls}
        locale={{ emptyText: copy.noToolCalls }}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" size={4} className="trace-item">
              <Typography.Text strong>{item.name}</Typography.Text>
              <Typography.Text>{copy.input}: {JSON.stringify(item.input)}</Typography.Text>
              <Typography.Text>{copy.output}: {item.output ? JSON.stringify(item.output) : copy.noOutput}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />

      <Divider orientation="left">{copy.sources}</Divider>
      <List
        bordered
        dataSource={result.sources}
        locale={{ emptyText: copy.noSources }}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" size={6} className="trace-item">
              <Space wrap>
                <Typography.Text strong>{item.documentTitle}</Typography.Text>
                <Tag color={item.method === 'vector' ? 'purple' : 'orange'}>{item.method}</Tag>
                <Tag>score {item.score.toFixed(3)}</Tag>
              </Space>
              <Typography.Paragraph ellipsis={{ rows: 3, expandable: true, symbol: copy.expand }}>
                {item.content}
              </Typography.Paragraph>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}

const traceCopy: Record<Language, {
  title: string;
  toolCalls: string;
  noToolCalls: string;
  input: string;
  output: string;
  noOutput: string;
  sources: string;
  noSources: string;
  expand: string;
}> = {
  en: {
    title: 'Agent execution trace',
    toolCalls: 'Tool calls',
    noToolCalls: 'No tools were called',
    input: 'Input',
    output: 'Output',
    noOutput: 'No order found',
    sources: 'Knowledge matches',
    noSources: 'No knowledge chunks matched',
    expand: 'Expand'
  },
  zh: {
    title: '执行轨迹',
    toolCalls: '工具调用',
    noToolCalls: '本次未调用工具',
    input: '输入',
    output: '输出',
    noOutput: '未查询到订单',
    sources: '知识命中',
    noSources: '没有命中知识片段',
    expand: '展开'
  }
};
