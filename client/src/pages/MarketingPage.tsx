import { useEffect, useState } from 'react';
import { Button, Card, Empty, Select, Space, Tag, Typography } from 'antd';
import type { Language, ProductRecord, RecommendationRule } from '../types';

const userTypeOptions = [
  { value: 'VIP 用户', en: 'VIP users', zh: 'VIP 用户' },
  { value: '新人用户', en: 'New users', zh: '新人用户' },
  { value: '价格敏感用户', en: 'Price-sensitive users', zh: '价格敏感用户' },
  { value: '智能家居兴趣用户', en: 'Smart home interest users', zh: '智能家居兴趣用户' }
];

export default function MarketingPage({ language }: { language: Language }) {
  const copy = marketingCopy[language];
  const [userType, setUserType] = useState(userTypeOptions[0].value);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [rule, setRule] = useState<RecommendationRule | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadFeed(userType);
  }, [userType]);

  async function loadFeed(nextUserType: string) {
    setLoading(true);
    try {
      const response = await fetch(`/api/recommendations/feed?userType=${encodeURIComponent(nextUserType)}`);
      const payload = await response.json();
      setProducts(payload.items ?? []);
      setRule(payload.rule ?? null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <section className="marketing-hero">
        <Typography.Title>{copy.title}</Typography.Title>
        <Typography.Paragraph>
          {copy.description}
        </Typography.Paragraph>
        <Space wrap>
          <Select
            value={userType}
            onChange={setUserType}
            options={userTypeOptions.map((option) => ({ label: option[language], value: option.value }))}
          />
          <Button loading={loading} onClick={() => void loadFeed(userType)}>
            {copy.refresh}
          </Button>
        </Space>
      </section>

      {rule ? (
        <Card className="panel-card" title={`${copy.activeRule}: ${displayRuleName(rule.name, language)}`}>
          <Typography.Paragraph>{displayRuleText(rule.naturalLanguage, language)}</Typography.Paragraph>
          <Space wrap>
            <Tag color={rule.validation.level === 'pass' ? 'success' : 'warning'}>{rule.validation.level}</Tag>
            <Tag>{copy.estimatedMatches} {rule.validation.estimatedMatches}</Tag>
          </Space>
        </Card>
      ) : null}

      {products.length === 0 ? (
        <Card className="panel-card">
          <Empty description={copy.empty} />
        </Card>
      ) : (
        <div className="product-grid">
          {products.map((product) => (
            <Card key={product.id ?? product.name} className="product-card">
              <Space direction="vertical" size="middle" className="product-card-body">
                <div>
                  <Tag color="blue">{translateTerm(product.category, language)}</Tag>
                  <Tag color={product.afterSaleRisk === 'high' ? 'red' : product.afterSaleRisk === 'medium' ? 'orange' : 'green'}>
                    {copy.risk}: {copy.riskLevels[product.afterSaleRisk]}
                  </Tag>
                </div>
                <Typography.Title level={4}>{translateTerm(product.name, language)}</Typography.Title>
                <Typography.Text className="product-price">¥{product.price}</Typography.Text>
                <Typography.Paragraph>{product.sellingPoints.map((item) => translateTerm(item, language)).join(' / ')}</Typography.Paragraph>
                <Space wrap>
                  {product.tags.map((tag) => (
                    <Tag key={tag}>{translateTerm(tag, language)}</Tag>
                  ))}
                </Space>
                <Typography.Text type="secondary">{buildProductReason(product, language)}</Typography.Text>
              </Space>
            </Card>
          ))}
        </div>
      )}
    </Space>
  );
}

function displayRuleName(name: string, language: Language) {
  if (language === 'zh') return name;
  return /[\u4e00-\u9fa5]/.test(name) ? 'Homepage exposure rule' : name;
}

function displayRuleText(text: string, language: Language) {
  if (language === 'zh') return text;
  return /[\u4e00-\u9fa5]/.test(text)
    ? 'Prioritize smart home products on the homepage, require sufficient stock and gross margin, exclude high after-sales risk products, and sort by recommendation score.'
    : text;
}

function buildProductReason(product: ProductRecord, language: Language) {
  if (language === 'zh') {
    return product.reason ?? `${product.category} 商品，推荐分 ${product.recommendScore}，库存 ${product.stock}`;
  }

  return `${translateTerm(product.category, language)} product, recommendation score ${product.recommendScore}, stock ${product.stock}, matched the homepage exposure rule`;
}

function translateTerm(value: string, language: Language) {
  if (language === 'zh') return value;
  return termTranslations[value] ?? value;
}

const termTranslations: Record<string, string> = {
  智能家居: 'Smart home',
  数码配件: 'Digital accessories',
  居家办公: 'Home office',
  日用百货: 'Daily goods',
  '智能保温杯 Pro': 'Smart Thermal Cup Pro',
  自动感应洗手机: 'Automatic Sensor Soap Dispenser',
  无线充电闹钟: 'Wireless Charging Alarm Clock',
  儿童学习台灯: 'Kids Study Lamp',
  恒温电热水壶: 'Temperature-Controlled Electric Kettle',
  宠物自动喂食器: 'Automatic Pet Feeder',
  保温: 'Thermal',
  智能: 'Smart',
  杯子: 'Cup',
  洗手机: 'Soap dispenser',
  自动感应: 'Sensor',
  无线充电: 'Wireless charging',
  闹钟: 'Alarm clock',
  学习: 'Study',
  台灯: 'Desk lamp',
  儿童: 'Kids',
  电热水壶: 'Electric kettle',
  恒温: 'Temperature control',
  厨房: 'Kitchen',
  宠物: 'Pet',
  喂食器: 'Feeder',
  智能温控: 'Smart temperature control',
  长效保温: 'Long-lasting insulation',
  节省水: 'Water saving',
  时尚设计: 'Modern design',
  护眼设计: 'Eye-care design',
  多种亮度: 'Multiple brightness levels',
  快速加热: 'Fast heating',
  恒温保持: 'Temperature holding',
  定时喂食: 'Scheduled feeding',
  智能控制: 'Smart control'
};

const marketingCopy: Record<Language, {
  title: string;
  description: string;
  refresh: string;
  activeRule: string;
  estimatedMatches: string;
  empty: string;
  risk: string;
  riskLevels: Record<ProductRecord['afterSaleRisk'], string>;
}> = {
  en: {
    title: 'Workflow Result Preview',
    description: 'Preview how saved workflow rules affect business outputs. This demo shows an e-commerce recommendation result page.',
    refresh: 'Refresh results',
    activeRule: 'Active rule',
    estimatedMatches: 'Estimated matches',
    empty: 'No products to display. Upload and save products from the workflow rules page first.',
    risk: 'After-sales risk',
    riskLevels: {
      low: 'low',
      medium: 'medium',
      high: 'high'
    }
  },
  zh: {
    title: '工作流结果预览',
    description: '预览已保存的工作流规则如何影响业务输出。当前演示展示电商推荐结果页。',
    refresh: '刷新结果',
    activeRule: '生效规则',
    estimatedMatches: '预计命中',
    empty: '暂无可展示商品，请先到工作流规则页面上传并入库商品',
    risk: '售后风险',
    riskLevels: {
      low: '低',
      medium: '中',
      high: '高'
    }
  }
};
