import { Card, Descriptions, Divider, List, Space, Tag, Typography } from 'antd';
import type { ChatResponse } from '../types';

export default function AgentTrace({ result }: { result: ChatResponse }) {
  return (
    <Card title="Agent 执行轨迹" className="panel-card">
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Session">{result.memory.sessionId}</Descriptions.Item>
        <Descriptions.Item label="Turns">{result.memory.turns}</Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">工具调用</Divider>
      <List
        bordered
        dataSource={result.toolCalls}
        locale={{ emptyText: '本次未调用工具' }}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" size={4} className="trace-item">
              <Typography.Text strong>{item.name}</Typography.Text>
              <Typography.Text>输入：{JSON.stringify(item.input)}</Typography.Text>
              <Typography.Text>输出：{item.output ? JSON.stringify(item.output) : '未查询到订单'}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />

      <Divider orientation="left">知识命中</Divider>
      <List
        bordered
        dataSource={result.sources}
        locale={{ emptyText: '没有命中知识片段' }}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" size={6} className="trace-item">
              <Space wrap>
                <Typography.Text strong>{item.documentTitle}</Typography.Text>
                <Tag color={item.method === 'vector' ? 'purple' : 'orange'}>{item.method}</Tag>
                <Tag>score {item.score.toFixed(3)}</Tag>
              </Space>
              <Typography.Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>
                {item.content}
              </Typography.Paragraph>
            </Space>
          </List.Item>
        )}
      />
    </Card>
  );
}
