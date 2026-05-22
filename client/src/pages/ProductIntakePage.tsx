import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, Space, Steps, Table, Tag, Typography, Upload, message as antdMessage } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RcFile } from 'antd/es/upload';
import * as XLSX from 'xlsx';
import type { Language, ProductRecord, RecommendationRule } from '../types';

const defaultRules: Record<Language, string> = {
  en: 'Prioritize smart home products on the homepage, require stock of at least 20, gross margin above 30%, exclude high after-sales risk products, and show 6 items sorted by recommendation score.',
  zh: '首页优先曝光智能家居商品，库存至少 20，毛利率高于 30%，过滤高售后风险商品，按推荐分从高到低展示 6 个。'
};

type ProcessStep = {
  key: string;
  title: string;
  description: string;
  status: 'wait' | 'process' | 'finish' | 'error';
};

export default function ProductIntakePage({ language }: { language: Language }) {
  const copy = productCopy[language];
  const initialSteps = useMemo(() => getInitialSteps(language), [language]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string | number>>>([]);
  const [drafts, setDrafts] = useState<ProductRecord[]>([]);
  const [ruleText, setRuleText] = useState(defaultRules[language]);
  const [rule, setRule] = useState<RecommendationRule | null>(null);
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>(initialSteps);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRuleText(defaultRules[language]);
    setProcessSteps(initialSteps);
    setRule(null);
  }, [initialSteps, language]);

  const columns: ColumnsType<ProductRecord> = [
    { title: copy.columns.product, dataIndex: 'name', key: 'name' },
    { title: copy.columns.category, dataIndex: 'category', key: 'category', render: (value) => <Tag color="blue">{value}</Tag> },
    { title: copy.columns.price, dataIndex: 'price', key: 'price', render: (value) => `¥${value}` },
    { title: copy.columns.stock, dataIndex: 'stock', key: 'stock' },
    { title: copy.columns.margin, dataIndex: 'grossMargin', key: 'grossMargin', render: (value) => `${Math.round(Number(value) * 100)}%` },
    { title: copy.columns.risk, dataIndex: 'afterSaleRisk', key: 'afterSaleRisk', render: (value) => copy.risk[value as ProductRecord['afterSaleRisk']] },
    { title: copy.columns.score, dataIndex: 'recommendScore', key: 'recommendScore' },
    { title: copy.columns.sellingPoints, dataIndex: 'sellingPoints', key: 'sellingPoints', render: (items: string[]) => items?.join(' / ') }
  ];

  async function beforeUpload(file: RcFile) {
    setProcessSteps(initialSteps);
    updateProcessStep('parse', 'process', copy.status.reading(file.name));
    const rows = await parseExcel(file);
    setRawRows(rows);
    setDrafts([]);
    setRule(null);
    updateProcessStep('parse', 'finish', copy.status.parsed(rows.length));
    updateProcessStep('enrich', 'process', copy.status.readyToEnrich);
    antdMessage.success(copy.status.parsed(rows.length));
    return Upload.LIST_IGNORE;
  }

  async function enrichProducts() {
    if (rawRows.length === 0) {
      antdMessage.warning(copy.status.uploadFirst);
      return;
    }

    setLoading(true);
    updateProcessStep('enrich', 'process', copy.status.enriching);
    try {
      const response = await fetch('/api/products/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rawRows })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? copy.status.enrichFailed);
      setDrafts(payload.items ?? []);
      updateProcessStep('enrich', 'finish', copy.status.enriched(payload.items?.length ?? 0));
      updateProcessStep('save-products', 'process', copy.status.readyToSave);
    } catch (error) {
      updateProcessStep('enrich', 'error', error instanceof Error ? error.message : copy.status.enrichFailed);
      antdMessage.error(error instanceof Error ? error.message : copy.status.enrichFailed);
    } finally {
      setLoading(false);
    }
  }

  async function saveProductsAndRule() {
    if (drafts.length === 0) {
      antdMessage.warning(copy.status.enrichFirst);
      return;
    }

    setLoading(true);
    updateProcessStep('save-products', 'process', copy.status.saving(drafts.length));
    updateProcessStep('rule', 'wait', copy.status.waitingForSave);
    try {
      const saveResponse = await fetch('/api/products/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: drafts })
      });
      const savePayload = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(savePayload.message ?? copy.status.saveFailed);
      updateProcessStep('save-products', 'finish', copy.status.saved(savePayload.items?.length ?? drafts.length));
      updateProcessStep('rule', 'process', copy.status.parsingRule);

      const ruleResponse = await fetch('/api/recommendations/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: copy.ruleName, naturalLanguage: ruleText })
      });
      const rulePayload = await ruleResponse.json();
      if (!ruleResponse.ok) throw new Error(rulePayload.message ?? copy.status.ruleFailed);

      setRule(rulePayload);
      updateProcessStep(
        'rule',
        rulePayload.validation.level === 'fail' ? 'error' : 'finish',
        copy.status.ruleValidated(rulePayload.validation.level, rulePayload.validation.estimatedMatches)
      );
      updateProcessStep('ready', rulePayload.validation.level === 'fail' ? 'error' : 'finish', copy.status.ready);
      antdMessage.success(copy.status.savedAll);
    } catch (error) {
      updateProcessStep('ready', 'error', error instanceof Error ? error.message : copy.status.saveFailed);
      antdMessage.error(error instanceof Error ? error.message : copy.status.saveFailed);
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

      <Card className="panel-card">
        <Space wrap>
          <Upload beforeUpload={beforeUpload} showUploadList={false} accept=".xlsx,.xls">
            <Button type="primary">{copy.upload}</Button>
          </Upload>
          <Button loading={loading} onClick={() => void enrichProducts()}>
            {copy.enrich}
          </Button>
          <Button type="primary" loading={loading} onClick={() => void saveProductsAndRule()}>
            {copy.save}
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" className="upload-hint">
          {copy.sampleFile}: samples/product-intake-demo.xlsx
        </Typography.Paragraph>
      </Card>

      <Card title={copy.processTitle} className="panel-card">
        <Steps direction="vertical" items={processSteps} />
      </Card>

      <Card title={copy.previewTitle} className="panel-card">
        <Table
          rowKey={(record) => record.name}
          columns={columns}
          dataSource={drafts}
          loading={loading}
          locale={{ emptyText: copy.noData }}
          pagination={false}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Card title={copy.ruleInputTitle} className="panel-card">
        <Space direction="vertical" className="chat-stack">
          <Input.TextArea value={ruleText} onChange={(event) => setRuleText(event.target.value)} autoSize={{ minRows: 4, maxRows: 8 }} />
          {rule ? (
            <Alert
              type={rule.validation.level === 'fail' ? 'error' : rule.validation.level === 'warning' ? 'warning' : 'success'}
              message={copy.status.ruleValidated(rule.validation.level, rule.validation.estimatedMatches)}
              description={
                <Space direction="vertical">
                  <Typography.Text>{rule.validation.warnings.length ? rule.validation.warnings.join(language === 'zh' ? '；' : '; ') : copy.ruleExecutable}</Typography.Text>
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

function getInitialSteps(language: Language): ProcessStep[] {
  return productCopy[language].steps.map((step) => ({ ...step }));
}

const productCopy: Record<Language, {
  title: string;
  description: string;
  upload: string;
  enrich: string;
  save: string;
  sampleFile: string;
  processTitle: string;
  previewTitle: string;
  ruleInputTitle: string;
  noData: string;
  ruleName: string;
  ruleExecutable: string;
  risk: Record<ProductRecord['afterSaleRisk'], string>;
  columns: Record<'product' | 'category' | 'price' | 'stock' | 'margin' | 'risk' | 'score' | 'sellingPoints', string>;
  steps: ProcessStep[];
  status: {
    reading: (fileName: string) => string;
    parsed: (count: number) => string;
    readyToEnrich: string;
    uploadFirst: string;
    enriching: string;
    enrichFailed: string;
    enriched: (count: number) => string;
    readyToSave: string;
    enrichFirst: string;
    saving: (count: number) => string;
    waitingForSave: string;
    saveFailed: string;
    saved: (count: number) => string;
    parsingRule: string;
    ruleFailed: string;
    ruleValidated: (level: string, count: number) => string;
    ready: string;
    savedAll: string;
  };
}> = {
  en: {
    title: 'Natural Language Workflow Rules',
    description:
      'Business teams can describe operating rules in natural language and let Echo Assistant convert them into validated workflow logic. This demo applies the workflow to product intake and recommendation rules.',
    upload: 'Upload Excel product file',
    enrich: 'Run AI intake assist',
    save: 'Save products and rule',
    sampleFile: 'Sample file',
    processTitle: 'AI processing steps',
    previewTitle: 'AI product intake preview',
    ruleInputTitle: 'Natural language rule input',
    noData: 'No data',
    ruleName: 'Homepage exposure rule',
    ruleExecutable: 'Rule is executable',
    risk: {
      low: 'low',
      medium: 'medium',
      high: 'high'
    },
    columns: {
      product: 'Product',
      category: 'Category',
      price: 'Price',
      stock: 'Stock',
      margin: 'Gross margin',
      risk: 'After-sales risk',
      score: 'Recommendation score',
      sellingPoints: 'AI selling points'
    },
    steps: [
      { key: 'parse', title: 'Parse Excel', description: 'Waiting for product file upload', status: 'wait' },
      { key: 'enrich', title: 'AI intake assist', description: 'Waiting for AI field enrichment', status: 'wait' },
      { key: 'save-products', title: 'Save products', description: 'Waiting for confirmation', status: 'wait' },
      { key: 'rule', title: 'Rule conversion and validation', description: 'Waiting for operating rule', status: 'wait' },
      { key: 'ready', title: 'Result page ready', description: 'Waiting for products and rule to take effect', status: 'wait' }
    ],
    status: {
      reading: (fileName) => `Reading ${fileName}`,
      parsed: (count) => `Parsed ${count} product rows`,
      readyToEnrich: 'Ready to run AI intake assist',
      uploadFirst: 'Upload an Excel file first',
      enriching: 'AI is identifying product name, category, price, stock, margin, and selling points',
      enrichFailed: 'AI enrichment failed',
      enriched: (count) => `Generated ${count} product drafts`,
      readyToSave: 'Review the preview and save the products',
      enrichFirst: 'Run AI intake assist first',
      saving: (count) => `Saving ${count} products`,
      waitingForSave: 'Waiting for products to be saved before parsing the rule',
      saveFailed: 'Save failed',
      saved: (count) => `Saved ${count} products`,
      parsingRule: 'AI is converting the natural language rule into a constrained DSL and validating it',
      ruleFailed: 'Rule save failed',
      ruleValidated: (level, count) => `Rule validation: ${level}, estimated matches: ${count}`,
      ready: 'The result page will read saved products and apply the rule',
      savedAll: 'Products and workflow rule saved'
    }
  },
  zh: {
    title: '自然语言工作流规则',
    description: '业务团队可以用自然语言描述运营规则，Echo Assistant 会将规则转换为可校验、可执行的工作流逻辑。当前演示使用商品入库和推荐规则场景。',
    upload: '上传商品表格',
    enrich: '智能批量录入辅助',
    save: '入库商品和规则',
    sampleFile: '示例文件',
    processTitle: '智能处理过程',
    previewTitle: '商品录入预览',
    ruleInputTitle: '自然语言规则输入',
    noData: '暂无数据',
    ruleName: '首页运营曝光规则',
    ruleExecutable: '规则可执行',
    risk: {
      low: '低',
      medium: '中',
      high: '高'
    },
    columns: {
      product: '商品',
      category: '类目',
      price: '价格',
      stock: '库存',
      margin: '毛利率',
      risk: '售后风险',
      score: '推荐分',
      sellingPoints: '智能卖点'
    },
    steps: [
      { key: 'parse', title: '解析 Excel', description: '等待上传商品资料', status: 'wait' },
      { key: 'enrich', title: '智能批量录入辅助', description: '等待系统补全商品字段', status: 'wait' },
      { key: 'save-products', title: '商品入库', description: '等待确认入库', status: 'wait' },
      { key: 'rule', title: '规则转换与校验', description: '等待运营规则', status: 'wait' },
      { key: 'ready', title: '结果页可用', description: '等待商品和规则生效', status: 'wait' }
    ],
    status: {
      reading: (fileName) => `正在读取 ${fileName}`,
      parsed: (count) => `已解析 ${count} 行商品资料`,
      readyToEnrich: '可以开始智能批量录入辅助',
      uploadFirst: '请先上传 Excel',
      enriching: '系统正在识别商品名、类目、价格、库存、毛利和卖点',
      enrichFailed: '字段补全失败',
      enriched: (count) => `已生成 ${count} 个商品录入草稿`,
      readyToSave: '请确认预览结果并入库',
      enrichFirst: '请先完成智能批量录入辅助',
      saving: (count) => `正在入库 ${count} 个商品`,
      waitingForSave: '等待商品保存完成后解析规则',
      saveFailed: '入库失败',
      saved: (count) => `已入库 ${count} 个商品`,
      parsingRule: '系统正在将运营自然语言规则转换为受限规则结构，并做合理性校验',
      ruleFailed: '规则保存失败',
      ruleValidated: (level, count) => `规则校验：${level}，预计命中 ${count} 个商品`,
      ready: '结果页将读取真实入库商品并按规则展示',
      savedAll: '商品和推荐曝光规则已入库'
    }
  }
};

async function parseExcel(file: RcFile) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
}
