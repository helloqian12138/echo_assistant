import { useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Layout, Menu, Segmented, Typography } from 'antd';
import AgentPage from './pages/AgentPage';
import KnowledgePage from './pages/KnowledgePage';
import MarketingPage from './pages/MarketingPage';
import ProductIntakePage from './pages/ProductIntakePage';
import type { Language } from './types';

const { Header, Content } = Layout;

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    return new URLSearchParams(window.location.search).get('lang') === 'zh' ? 'zh' : 'en';
  });
  const location = useLocation();
  const copy = appCopy[language];
  const selectedKey = location.pathname.startsWith('/knowledge')
    ? '/knowledge'
    : location.pathname.startsWith('/products')
      ? '/products'
      : location.pathname.startsWith('/marketing')
        ? '/marketing'
        : '/agent';

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <div className="brand">
          <svg className="brand-logo" viewBox="0 0 96 36" role="img" aria-label="Echo AI logo">
            <rect x="1" y="1" width="94" height="34" rx="8" fill="#111827" />
            <path d="M12 25V11h21v4H17v2h14v4H17v2h16v4H12Z" fill="#ffffff" />
            <text x="41" y="23" fill="#ffffff" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="700">
              Echo AI
            </text>
          </svg>
          <div className="brand-copy">
            <Typography.Title level={3} className="app-title">
              Echo Assistant
            </Typography.Title>
            <Typography.Text className="app-subtitle">{copy.subtitle}</Typography.Text>
          </div>
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          className="app-nav"
          items={[
            {
              key: '/agent',
              label: <NavLink to="/agent">{copy.nav.agent}</NavLink>
            },
            {
              key: '/knowledge',
              label: <NavLink to="/knowledge">{copy.nav.knowledge}</NavLink>
            },
            {
              key: '/products',
              label: <NavLink to="/products">{copy.nav.products}</NavLink>
            },
            {
              key: '/marketing',
              label: <NavLink to="/marketing">{copy.nav.marketing}</NavLink>
            }
          ]}
        />
        <Segmented
          className="language-switch"
          size="small"
          value={language}
          onChange={(value) => setLanguage(value as Language)}
          options={[
            { label: copy.language.en, value: 'en' },
            { label: copy.language.zh, value: 'zh' }
          ]}
        />
      </Header>
      <Content className="app-content">
        <Routes>
          <Route path="/" element={<Navigate to="/agent" replace />} />
          <Route path="/agent" element={<AgentPage language={language} />} />
          <Route path="/knowledge" element={<KnowledgePage language={language} />} />
          <Route path="/products" element={<ProductIntakePage language={language} />} />
          <Route path="/marketing" element={<MarketingPage language={language} />} />
        </Routes>
      </Content>
    </Layout>
  );
}

const appCopy: Record<Language, {
  subtitle: string;
  language: {
    en: string;
    zh: string;
  };
  nav: {
    agent: string;
    knowledge: string;
    products: string;
    marketing: string;
  };
}> = {
  en: {
    subtitle: 'AI-native Enterprise Workflow Assistant',
    language: {
      en: 'English',
      zh: 'Chinese'
    },
    nav: {
      agent: 'Support Agent',
      knowledge: 'Knowledge',
      products: 'Workflow Rules',
      marketing: 'Result Preview'
    }
  },
  zh: {
    subtitle: '企业智能工作流助手',
    language: {
      en: '英文',
      zh: '中文'
    },
    nav: {
      agent: '客服助手',
      knowledge: '知识库',
      products: '工作流规则',
      marketing: '结果预览'
    }
  }
};
