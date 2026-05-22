import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Space, Typography } from 'antd';
import AgentTrace from '../components/AgentTrace';
import ReadinessPanel from '../components/ReadinessPanel';
import type { ChatMessage, ChatResponse, ChatStreamEvent, Language, ReadinessStatus } from '../types';

const sessionId = `web_${Date.now()}`;

export default function AgentPage({ language }: { language: Language }) {
  const copy = agentCopy[language];
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [message, setMessage] = useState(copy.defaultQuestion);
  const [messages, setMessages] = useState<ChatMessage[]>(copy.demoMessages);
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);
  const [agentStatus, setAgentStatus] = useState(copy.idleStatus);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void refreshReadiness();
  }, []);

  useEffect(() => {
    setMessage(copy.defaultQuestion);
    setMessages(copy.demoMessages);
    setAgentStatus(copy.idleStatus);
    setChatResult(null);
    setError('');
  }, [language]);

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
    setAgentStatus(copy.submittingStatus);

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
        throw new Error(payload.message ?? copy.requestFailed);
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
          setAgentStatus(copy.doneStatus);
        },
        onError: (streamError) => {
          throw new Error(streamError);
        }
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : copy.requestFailed;
      setError(errorMessage);
      setAgentStatus(copy.failedStatus);
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
        <Typography.Title level={2}>{copy.title}</Typography.Title>
        <Typography.Paragraph>
          {copy.description}
        </Typography.Paragraph>
      </section>

      <ReadinessPanel language={language} readiness={readiness} onRefresh={refreshReadiness} />

      <Card
        title={copy.cardTitle}
        className="panel-card chat-panel"
        extra={<span className={loading ? 'agent-status agent-status-running' : 'agent-status'}>{agentStatus}</span>}
      >
        <Space direction="vertical" size="middle" className="chat-stack">
          <div className="conversation">
            {messages.map((item) => (
              <div key={item.id} className={`message-row message-row-${item.role}`}>
                <div className={`message-bubble message-bubble-${item.role}`}>
                  {item.content || (item.role === 'assistant' && loading ? <span className="typing-dot">{copy.thinking}</span> : null)}
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
            placeholder={copy.placeholder}
          />
          <Button type="primary" loading={loading} onClick={() => void sendMessage()}>
            {copy.send}
          </Button>
          {error ? <Alert type="error" message={error} /> : null}
        </Space>
      </Card>

      {chatResult ? <AgentTrace language={language} result={chatResult} /> : null}
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
    throw new Error('Streaming response is not supported by this browser.');
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

const agentCopy: Record<Language, {
  title: string;
  description: string;
  cardTitle: string;
  defaultQuestion: string;
  placeholder: string;
  send: string;
  thinking: string;
  idleStatus: string;
  submittingStatus: string;
  doneStatus: string;
  failedStatus: string;
  requestFailed: string;
  demoMessages: ChatMessage[];
}> = {
  en: {
    title: 'AI Customer Support',
    description:
      'Echo Assistant uses enterprise knowledge and workflow tools to answer support questions. This demo uses an e-commerce after-sales scenario.',
    cardTitle: 'Customer support workflow',
    defaultQuestion: 'Order E1001 wants a refund. What should we do?',
    placeholder: 'Example: Order E1001 wants a refund. What should we do?',
    send: 'Send',
    thinking: 'Thinking',
    idleStatus: 'Waiting for question',
    submittingStatus: 'Submitting question',
    doneStatus: 'Answer completed',
    failedStatus: 'Execution failed',
    requestFailed: 'Request failed',
    demoMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        content:
          'Hi, I am Echo Assistant. Ask me about after-sales issues, refunds, logistics exceptions, or operational SOPs.'
      },
      {
        id: 'demo-user',
        role: 'user',
        content: 'Order E1001 wants a refund. What should we do?'
      },
      {
        id: 'demo-assistant',
        role: 'assistant',
        content:
          'According to the current after-sales SOP, first check the order status and delivery time. If the order is beyond the 7-day window, route it to manual approval. If it is still eligible, generate a refund handling suggestion and share the expected processing time with the customer.'
      }
    ]
  },
  zh: {
    title: '智能客服助手',
    description: 'Echo Assistant 基于企业知识库和工作流工具回答支持问题。当前演示使用电商售后场景。',
    cardTitle: '客服处理工作流',
    defaultQuestion: '订单 E1001 用户想退款，应该怎么处理？',
    placeholder: '例如：订单 E1001 用户想退款，应该怎么处理？',
    send: '发送',
    thinking: '正在思考',
    idleStatus: '等待提问',
    submittingStatus: '正在提交问题',
    doneStatus: '回答完成',
    failedStatus: '执行失败',
    requestFailed: '请求失败',
    demoMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: '你好，我是 Echo Assistant。你可以直接询问订单售后、退款、物流异常等问题。'
      },
      {
        id: 'demo-user',
        role: 'user',
        content: '订单 E1001 用户想退款，应该怎么处理？'
      },
      {
        id: 'demo-assistant',
        role: 'assistant',
        content:
          '根据当前售后流程规范，先查询订单状态和签收时间。如果订单已超过 7 天，需要转人工审批；如果仍在可退周期内，可以生成退款处理建议，并向用户同步预计处理时效。'
      }
    ]
  }
};

function parseSseEvent(rawEvent: string): ChatStreamEvent | null {
  const dataLine = rawEvent
    .split('\n')
    .find((line) => line.startsWith('data:'));

  if (!dataLine) {
    return null;
  }

  return JSON.parse(dataLine.slice(5).trim()) as ChatStreamEvent;
}
