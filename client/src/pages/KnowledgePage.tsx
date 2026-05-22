import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal, Space, Table, Tag, Typography, Upload, message as antdMessage } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RcFile } from 'antd/es/upload';
import type { KnowledgeDocument, KnowledgeItem, Language } from '../types';

export default function KnowledgePage({ language }: { language: Language }) {
  const copy = knowledgeCopy[language];
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
        title: copy.columns.name,
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
        title: copy.columns.source,
        dataIndex: 'source',
        key: 'source',
        width: 110,
        render: (source: KnowledgeItem['source']) => (
          <Tag color={source === 'seed' ? 'blue' : 'green'}>{source === 'seed' ? copy.seed : copy.uploaded}</Tag>
        )
      },
      {
        title: copy.columns.index,
        key: 'index',
        width: 130,
        render: (_, record) => (
          <Space>
            <Tag color="geekblue">{record.chunks} {copy.chunks}</Tag>
            <Tag color="default">{record.size} {copy.characters}</Tag>
          </Space>
        )
      },
      {
        title: copy.columns.actions,
        key: 'actions',
        width: 170,
        render: (_, record) => (
          <Space>
            <Button size="small" onClick={() => previewKnowledge(record.id)}>
              {copy.preview}
            </Button>
            <Button size="small" danger disabled={record.source === 'seed'} onClick={() => deleteKnowledge(record.id)}>
              {copy.delete}
            </Button>
          </Space>
        )
      }
    ],
    [copy]
  );

  async function refreshKnowledge() {
    setKnowledgeLoading(true);
    try {
      const response = await fetch('/api/knowledge');
      const payload = await response.json();
      setKnowledgeItems(payload.items ?? []);
    } catch (err) {
      antdMessage.error(err instanceof Error ? err.message : copy.loadFailed);
    } finally {
      setKnowledgeLoading(false);
    }
  }

  async function previewKnowledge(id: string) {
    const response = await fetch(`/api/knowledge/${id}`);
    const payload = await response.json();
    if (!response.ok) {
      antdMessage.error(payload.message ?? copy.previewFailed);
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
      antdMessage.error(payload.message ?? copy.deleteFailed);
      return;
    }

    antdMessage.success(copy.deleted);
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
      antdMessage.error(payload.message ?? copy.uploadFailed);
      return Upload.LIST_IGNORE;
    }

    antdMessage.success(copy.uploadedDone);
    await refreshKnowledge();
    return Upload.LIST_IGNORE;
  }

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <section className="page-head">
        <Typography.Title level={2}>{copy.title}</Typography.Title>
        <Typography.Paragraph>
          {copy.description}
        </Typography.Paragraph>
      </section>

      <Card className="panel-card">
        <Space wrap>
          <Upload beforeUpload={uploadKnowledge} showUploadList={false} accept=".txt,.md,.csv">
            <Button type="primary">{copy.upload}</Button>
          </Upload>
          <Button onClick={() => void refreshKnowledge()}>{copy.refresh}</Button>
        </Space>
      </Card>

      <Card title={copy.listTitle} className="panel-card">
        <Table
          rowKey="id"
          loading={knowledgeLoading}
          columns={knowledgeColumns}
          dataSource={knowledgeItems}
          locale={{ emptyText: copy.noData }}
          pagination={false}
        />
      </Card>

      <Modal title={preview?.title} open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={900}>
        <pre className="knowledge-preview">{preview?.content}</pre>
      </Modal>
    </Space>
  );
}

const knowledgeCopy: Record<Language, {
  title: string;
  description: string;
  upload: string;
  refresh: string;
  listTitle: string;
  seed: string;
  uploaded: string;
  chunks: string;
  characters: string;
  preview: string;
  delete: string;
  noData: string;
  loadFailed: string;
  previewFailed: string;
  deleteFailed: string;
  deleted: string;
  uploadFailed: string;
  uploadedDone: string;
  columns: {
    name: string;
    source: string;
    index: string;
    actions: string;
  };
}> = {
  en: {
    title: 'Enterprise Knowledge Base',
    description:
      'Manage enterprise policies, SOPs, and operational knowledge. The current seed document is an e-commerce support SOP for the demo scenario.',
    upload: 'Upload knowledge file',
    refresh: 'Refresh list',
    listTitle: 'Knowledge documents',
    seed: 'Seed demo',
    uploaded: 'Uploaded',
    chunks: 'chunks',
    characters: 'chars',
    preview: 'Preview',
    delete: 'Delete',
    noData: 'No knowledge documents',
    loadFailed: 'Failed to load knowledge',
    previewFailed: 'Preview failed',
    deleteFailed: 'Delete failed',
    deleted: 'Knowledge deleted',
    uploadFailed: 'Upload failed',
    uploadedDone: 'Knowledge uploaded and indexed',
    columns: {
      name: 'Knowledge name',
      source: 'Source',
      index: 'Index',
      actions: 'Actions'
    }
  },
  zh: {
    title: '企业知识库',
    description: '管理企业政策、流程文档和运营知识。当前内置文档是用于演示场景的电商客服流程规范。',
    upload: '上传知识文件',
    refresh: '刷新列表',
    listTitle: '知识列表',
    seed: '内置示例',
    uploaded: '上传',
    chunks: '片段',
    characters: '字',
    preview: '预览',
    delete: '删除',
    noData: '暂无知识文档',
    loadFailed: '加载知识失败',
    previewFailed: '预览失败',
    deleteFailed: '删除失败',
    deleted: '已删除知识',
    uploadFailed: '上传失败',
    uploadedDone: '知识已上传并完成索引',
    columns: {
      name: '知识名称',
      source: '来源',
      index: '索引',
      actions: '操作'
    }
  }
};
