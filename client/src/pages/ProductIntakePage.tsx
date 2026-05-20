import { useState } from 'react';
import { Alert, Button, Card, Input, Space, Steps, Table, Tag, Typography, Upload, message as antdMessage } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RcFile } from 'antd/es/upload';
import * as XLSX from 'xlsx';
import type { ProductRecord, RecommendationRule } from '../types';

const defaultRule =
  '首页优先曝光智能家居商品，库存至少 20，毛利率高于 30%，过滤高售后风险商品，按推荐分从高到低展示 6 个。';

type ProcessStep = {
  key: string;
  title: string;
  description: string;
  status: 'wait' | 'process' | 'finish' | 'error';
};

const initialSteps: ProcessStep[] = [
  { key: 'parse', title: '解析 Excel', description: '等待上传商品资料', status: 'wait' },
  { key: 'enrich', title: 'AI 批量录入辅助', description: '等待 AI 补全商品字段', status: 'wait' },
  { key: 'save-products', title: '商品入库', description: '等待确认入库', status: 'wait' },
  { key: 'rule', title: '规则转换与校验', description: '等待运营规则', status: 'wait' },
  { key: 'ready', title: '营销页可用', description: '等待商品和规则生效', status: 'wait' }
];

export default function ProductIntakePage() {
  const [rawRows, setRawRows] = useState<Array<Record<string, string | number>>>([]);
  const [drafts, setDrafts] = useState<ProductRecord[]>([]);
  const [ruleText, setRuleText] = useState(defaultRule);
  const [rule, setRule] = useState<RecommendationRule | null>(null);
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>(initialSteps);
  const [loading, setLoading] = useState(false);

  const columns: ColumnsType<ProductRecord> = [
    { title: '商品', dataIndex: 'name', key: 'name' },
    { title: '类目', dataIndex: 'category', key: 'category', render: (value) => <Tag color="blue">{value}</Tag> },
    { title: '价格', dataIndex: 'price', key: 'price', render: (value) => `¥${value}` },
    { title: '库存', dataIndex: 'stock', key: 'stock' },
    { title: '毛利率', dataIndex: 'grossMargin', key: 'grossMargin', render: (value) => `${Math.round(Number(value) * 100)}%` },
    { title: '售后风险', dataIndex: 'afterSaleRisk', key: 'afterSaleRisk' },
    { title: '推荐分', dataIndex: 'recommendScore', key: 'recommendScore' },
    { title: 'AI 卖点', dataIndex: 'sellingPoints', key: 'sellingPoints', render: (items: string[]) => items?.join(' / ') }
  ];

  async function beforeUpload(file: RcFile) {
    setProcessSteps(initialSteps);
    updateProcessStep('parse', 'process', `正在读取 ${file.name}`);
    const rows = await parseExcel(file);
    setRawRows(rows);
    setDrafts([]);
    setRule(null);
    updateProcessStep('parse', 'finish', `已解析 ${rows.length} 行商品资料`);
    updateProcessStep('enrich', 'process', '可以开始 AI 批量录入辅助');
    antdMessage.success(`已解析 ${rows.length} 行商品资料`);
    return Upload.LIST_IGNORE;
  }

  async function enrichProducts() {
    if (rawRows.length === 0) {
      antdMessage.warning('请先上传 Excel');
      return;
    }

    setLoading(true);
    updateProcessStep('enrich', 'process', 'AI 正在识别商品名、类目、价格、库存、毛利和卖点');
    try {
      const response = await fetch('/api/products/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rawRows })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'AI 补全失败');
      setDrafts(payload.items ?? []);
      updateProcessStep('enrich', 'finish', `已生成 ${payload.items?.length ?? 0} 个商品录入草稿`);
      updateProcessStep('save-products', 'process', '请确认预览结果并入库');
    } catch (error) {
      updateProcessStep('enrich', 'error', error instanceof Error ? error.message : 'AI 补全失败');
      antdMessage.error(error instanceof Error ? error.message : 'AI 补全失败');
    } finally {
      setLoading(false);
    }
  }

  async function saveProductsAndRule() {
    if (drafts.length === 0) {
      antdMessage.warning('请先完成 AI 批量录入辅助');
      return;
    }

    setLoading(true);
    updateProcessStep('save-products', 'process', `正在入库 ${drafts.length} 个商品`);
    updateProcessStep('rule', 'wait', '等待商品保存完成后解析规则');
    try {
      const saveResponse = await fetch('/api/products/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: drafts })
      });
      const savePayload = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(savePayload.message ?? '商品入库失败');
      updateProcessStep('save-products', 'finish', `已入库 ${savePayload.items?.length ?? drafts.length} 个商品`);
      updateProcessStep('rule', 'process', 'AI 正在将运营自然语言规则转换为受限 DSL，并做合理性校验');

      const ruleResponse = await fetch('/api/recommendations/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '首页运营曝光规则', naturalLanguage: ruleText })
      });
      const rulePayload = await ruleResponse.json();
      if (!ruleResponse.ok) throw new Error(rulePayload.message ?? '规则保存失败');

      setRule(rulePayload);
      updateProcessStep(
        'rule',
        rulePayload.validation.level === 'fail' ? 'error' : 'finish',
        `规则校验 ${rulePayload.validation.level}，预计命中 ${rulePayload.validation.estimatedMatches} 个商品`
      );
      updateProcessStep('ready', rulePayload.validation.level === 'fail' ? 'error' : 'finish', '营销页将读取真实入库商品并按规则展示');
      antdMessage.success('商品和推荐曝光规则已入库');
    } catch (error) {
      updateProcessStep('ready', 'error', error instanceof Error ? error.message : '入库失败');
      antdMessage.error(error instanceof Error ? error.message : '入库失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <section className="page-head">
        <Typography.Title level={2}>商品入库流程自动化</Typography.Title>
        <Typography.Paragraph>
          上传 Excel 商品资料，AI 批量补全类目、卖点、标签、目标人群和推荐分；运营填写自然语言曝光规则后，系统转换为受限规则并入库。
        </Typography.Paragraph>
      </section>

      <Card className="panel-card">
        <Space wrap>
          <Upload beforeUpload={beforeUpload} showUploadList={false} accept=".xlsx,.xls">
            <Button type="primary">上传 Excel 商品资料</Button>
          </Upload>
          <Button loading={loading} onClick={() => void enrichProducts()}>
            AI 批量录入辅助
          </Button>
          <Button type="primary" loading={loading} onClick={() => void saveProductsAndRule()}>
            入库商品和规则
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" className="upload-hint">
          示例文件：samples/product-intake-demo.xlsx
        </Typography.Paragraph>
      </Card>

      <Card title="AI 处理过程" className="panel-card">
        <Steps direction="vertical" items={processSteps} />
      </Card>

      <Card title="AI 商品录入预览" className="panel-card">
        <Table rowKey={(record) => record.name} columns={columns} dataSource={drafts} loading={loading} pagination={false} scroll={{ x: 1100 }} />
      </Card>

      <Card title="运营推荐曝光规则" className="panel-card">
        <Space direction="vertical" className="chat-stack">
          <Input.TextArea value={ruleText} onChange={(event) => setRuleText(event.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} />
          {rule ? (
            <Alert
              type={rule.validation.level === 'fail' ? 'error' : rule.validation.level === 'warning' ? 'warning' : 'success'}
              message={`规则校验：${rule.validation.level}，预计命中 ${rule.validation.estimatedMatches} 个商品`}
              description={
                <Space direction="vertical">
                  <Typography.Text>{rule.validation.warnings.length ? rule.validation.warnings.join('；') : '规则可执行'}</Typography.Text>
                  <pre className="rule-preview">{JSON.stringify(rule.dsl, null, 2)}</pre>
                </Space>
              }
            />
          ) : null}
        </Space>
      </Card>
    </Space>
  );

  function updateProcessStep(key: string, status: ProcessStep['status'], description: string) {
    setProcessSteps((steps) =>
      steps.map((step) => (step.key === key ? { ...step, status, description } : step))
    );
  }
}

async function parseExcel(file: RcFile) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
}
