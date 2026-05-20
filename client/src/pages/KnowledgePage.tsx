import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal, Space, Table, Tag, Typography, Upload, message as antdMessage } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RcFile } from 'antd/es/upload';
import type { KnowledgeDocument, KnowledgeItem } from '../types';

export default function KnowledgePage() {
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [preview, setPreview] = useState<KnowledgeDocument | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    void refreshKnowledge();
  }, []);

  const knowledgeColumns = useMemo<ColumnsType<KnowledgeItem>>(
    () => [
      {
        title: '知识名称',
        dataIndex: 'title',
        key: 'title',
        render: (value: string, record) => (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{value}</Typography.Text>
            <Typography.Text type="secondary">{record.id}</Typography.Text>
          </Space>
        )
      },
      {
        title: '来源',
        dataIndex: 'source',
        key: 'source',
        width: 110,
        render: (source: KnowledgeItem['source']) => (
          <Tag color={source === 'seed' ? 'blue' : 'green'}>{source === 'seed' ? '内置示例' : '上传'}</Tag>
        )
      },
      {
        title: '索引',
        key: 'index',
        width: 130,
        render: (_, record) => (
          <Space>
            <Tag color="geekblue">{record.chunks} chunks</Tag>
            <Tag color="default">{record.size} 字</Tag>
          </Space>
        )
      },
      {
        title: '操作',
        key: 'actions',
        width: 170,
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => previewKnowledge(record.id)}>
              预览
            </Button>
            <Button size="small" danger disabled={record.source === 'seed'} onClick={() => deleteKnowledge(record.id)}>
              删除
            </Button>
          </Space>
        )
      }
    ],
    []
  );

  async function refreshKnowledge() {
    setKnowledgeLoading(true);
    try {
      const response = await fetch('/api/knowledge');
      const payload = await response.json();
      setKnowledgeItems(payload.items ?? []);
    } catch (err) {
      antdMessage.error(err instanceof Error ? err.message : '加载知识失败');
    } finally {
      setKnowledgeLoading(false);
    }
  }

  async function previewKnowledge(id: string) {
    const response = await fetch(`/api/knowledge/${id}`);
    const payload = await response.json();
    if (!response.ok) {
      antdMessage.error(payload.message ?? '预览失败');
      return;
    }

    setPreview(payload);
    setPreviewOpen(true);
  }

  async function deleteKnowledge(id: string) {
    const response = await fetch(`/api/knowledge/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const payload = await response.json();
      antdMessage.error(payload.message ?? '删除失败');
      return;
    }

    antdMessage.success('已删除知识');
    await refreshKnowledge();
  }

  async function uploadKnowledge(file: RcFile) {
    const content = await file.text();
    const response = await fetch('/api/knowledge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: file.name,
        content
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      antdMessage.error(payload.message ?? '上传失败');
      return Upload.LIST_IGNORE;
    }

    antdMessage.success('知识已上传并完成索引');
    await refreshKnowledge();
    return Upload.LIST_IGNORE;
  }

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <section className="page-head">
        <Typography.Title level={2}>知识管理</Typography.Title>
        <Typography.Paragraph>
          管理企业知识文档。系统已内置一份电商客服 SOP 示例知识，上传的文本文件会自动切分并加入本地检索索引。
        </Typography.Paragraph>
      </section>

      <Card className="panel-card">
        <Space wrap>
          <Upload beforeUpload={uploadKnowledge} showUploadList={false} accept=".txt,.md,.csv">
            <Button type="primary">上传知识文件</Button>
          </Upload>
          <Button onClick={() => void refreshKnowledge()}>刷新列表</Button>
        </Space>
      </Card>

      <Card title="知识列表" className="panel-card">
        <Table rowKey="id" loading={knowledgeLoading} columns={knowledgeColumns} dataSource={knowledgeItems} pagination={false} />
      </Card>

      <Modal title={preview?.title} open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={900}>
        <pre className="knowledge-preview">{preview?.content}</pre>
      </Modal>
    </Space>
  );
}
