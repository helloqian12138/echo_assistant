import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Space, Typography } from 'antd';
import AgentTrace from '../components/AgentTrace';
import ReadinessPanel from '../components/ReadinessPanel';
import type { ChatMessage, ChatResponse, ChatStreamEvent, ReadinessStatus } from '../types';

const sessionId = `web_${Date.now()}`;

export default function AgentPage() {
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [message, setMessage] = useState('订单 E1001 用户想退款，应该怎么处理？');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好，我是 Echo Assistant。你可以直接问订单售后、退款、物流异常等问题，例如：订单 E1001 用户想退款，应该怎么处理？'
    }
  ]);
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);
  const [agentStatus, setAgentStatus] = useState('等待提问');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void refreshReadiness();
  }, []);

  async function refreshReadiness() {
    const response = await fetch('/api/readiness');
    const payload = await response.json();
    setReadiness(payload);
  }

  async function sendMessage() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || loading) {
      return;
    }

    setLoading(true);
    setError('');
    setChatResult(null);
    setAgentStatus('正在提交问题');

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: trimmedMessage
    };
    const assistantMessageId = `assistant_${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: ''
    };

    setMessages((items) => [...items, userMessage, assistantMessage]);
    setMessage('');

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: trimmedMessage, sessionId })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message ?? '请求失败');
      }

      await readStream(response, {
        onStatus: (status) => setAgentStatus(status),
        onToken: (token) => {
          setMessages((items) =>
            items.map((item) => (item.id === assistantMessageId ? { ...item, content: item.content + token } : item))
          );
        },
        onDone: (result) => {
          setChatResult(result);
          setAgentStatus('回答完成');
        },
        onError: (streamError) => {
          throw new Error(streamError);
        }
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '请求失败';
      setError(errorMessage);
      setAgentStatus('执行失败');
      setMessages((items) =>
        items.map((item) => (item.id === assistantMessageId ? { ...item, content: errorMessage } : item))
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <section className="page-head">
        <Typography.Title level={2}>企业知识库 Agent</Typography.Title>
        <Typography.Paragraph>
          Agent 会优先向量检索知识库，必要时用关键词检索兜底，并调用订单查询工具形成客服处理建议。
        </Typography.Paragraph>
      </section>

      <ReadinessPanel readiness={readiness} onRefresh={refreshReadiness} />

      <Card
        title="对话测试"
        className="panel-card chat-panel"
        extra={<span className={loading ? 'agent-status agent-status-running' : 'agent-status'}>{agentStatus}</span>}
      >
        <Space direction="vertical" size="middle" className="chat-stack">
          <div className="conversation">
            {messages.map((item) => (
              <div key={item.id} className={`message-row message-row-${item.role}`}>
                <div className={`message-bubble message-bubble-${item.role}`}>
                  {item.content || (item.role === 'assistant' && loading ? <span className="typing-dot">正在思考</span> : null)}
                </div>
              </div>
            ))}
          </div>
          <Input.TextArea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="例如：订单 E1001 用户想退款，应该怎么处理？"
          />
          <Button type="primary" loading={loading} onClick={() => void sendMessage()}>
            发送
          </Button>
          {error ? <Alert type="error" message={error} /> : null}
        </Space>
      </Card>

      {chatResult ? <AgentTrace result={chatResult} /> : null}
    </Space>
  );
}

async function readStream(
  response: Response,
  handlers: {
    onStatus: (message: string) => void;
    onToken: (token: string) => void;
    onDone: (result: ChatResponse) => void;
    onError: (message: string) => void;
  }
) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('浏览器不支持流式响应');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const event = parseSseEvent(rawEvent);
      if (!event) {
        continue;
      }

      if (event.type === 'status') {
        handlers.onStatus(event.message);
      } else if (event.type === 'token') {
        handlers.onToken(event.token);
      } else if (event.type === 'done') {
        handlers.onDone(event.result);
      } else if (event.type === 'error') {
        handlers.onError(event.message);
      }
    }
  }
}

function parseSseEvent(rawEvent: string): ChatStreamEvent | null {
  const dataLine = rawEvent
    .split('\n')
    .find((line) => line.startsWith('data:'));

  if (!dataLine) {
    return null;
  }

  return JSON.parse(dataLine.slice(5).trim()) as ChatStreamEvent;
}
