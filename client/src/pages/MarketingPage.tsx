import { useEffect, useState } from 'react';
import { Button, Card, Empty, Select, Space, Tag, Typography } from 'antd';
import type { ProductRecord, RecommendationRule } from '../types';

const userTypes = ['VIP 用户', '新人用户', '价格敏感用户', '智能家居兴趣用户'];

export default function MarketingPage() {
  const [userType, setUserType] = useState(userTypes[0]);
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
        <Typography.Title>今日为你推荐</Typography.Title>
        <Typography.Paragraph>
          当前商品来自商品入库流程，营销页根据运营曝光规则实时筛选和排序。
        </Typography.Paragraph>
        <Space wrap>
          <Select value={userType} onChange={setUserType} options={userTypes.map((value) => ({ label: value, value }))} />
          <Button loading={loading} onClick={() => void loadFeed(userType)}>
            刷新推荐
          </Button>
        </Space>
      </section>

      {rule ? (
        <Card className="panel-card" title={`生效规则：${rule.name}`}>
          <Typography.Paragraph>{rule.naturalLanguage}</Typography.Paragraph>
          <Space wrap>
            <Tag color={rule.validation.level === 'pass' ? 'success' : 'warning'}>{rule.validation.level}</Tag>
            <Tag>预计命中 {rule.validation.estimatedMatches}</Tag>
          </Space>
        </Card>
      ) : null}

      {products.length === 0 ? (
        <Card className="panel-card">
          <Empty description="暂无可展示商品，请先到商品入库页面上传并入库商品" />
        </Card>
      ) : (
        <div className="product-grid">
          {products.map((product) => (
            <Card key={product.id ?? product.name} className="product-card">
              <Space direction="vertical" size="middle" className="product-card-body">
                <div>
                  <Tag color="blue">{product.category}</Tag>
                  <Tag color={product.afterSaleRisk === 'high' ? 'red' : product.afterSaleRisk === 'medium' ? 'orange' : 'green'}>
                    售后风险 {product.afterSaleRisk}
                  </Tag>
                </div>
                <Typography.Title level={4}>{product.name}</Typography.Title>
                <Typography.Text className="product-price">¥{product.price}</Typography.Text>
                <Typography.Paragraph>{product.sellingPoints.join(' / ')}</Typography.Paragraph>
                <Space wrap>
                  {product.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Space>
                <Typography.Text type="secondary">{product.reason}</Typography.Text>
              </Space>
            </Card>
          ))}
        </div>
      )}
    </Space>
  );
}
