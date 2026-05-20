import { useState } from 'react';
import { Alert, Button, Card, Input, Layout, Space, Typography } from 'antd';

type ChatResponse = {
  answer: string;
};

const { Header, Content } = Layout;

export default function App() {
  const [message, setMessage] = useState('用一句话介绍 Echo Assistant');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    setLoading(true);
    setError('');
    setAnswer('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? '请求失败');
      }

      setAnswer((payload as ChatResponse).answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <Typography.Title level={3} className="app-title">
          Echo Assistant
        </Typography.Title>
      </Header>
      <Content className="app-content">
        <section className="intro">
          <Typography.Title>AI 企业知识库助手</Typography.Title>
          <Typography.Paragraph>
            Hello World. 当前框架已包含 React + Vite + Antd 前端，以及 Express + LangChain 后端示例接口。
          </Typography.Paragraph>
        </section>

        <Card title="ChatGPT 调用示例" className="chat-card">
          <Space direction="vertical" size="middle" className="chat-stack">
            <Input.TextArea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder="输入一个问题"
            />
            <Button type="primary" loading={loading} onClick={sendMessage}>
              发送
            </Button>
            {answer ? <Alert type="success" message={answer} /> : null}
            {error ? <Alert type="error" message={error} /> : null}
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}
