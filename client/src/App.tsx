import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import AgentPage from './pages/AgentPage';
import KnowledgePage from './pages/KnowledgePage';

const { Header, Content } = Layout;

export default function App() {
  const location = useLocation();
  const selectedKey = location.pathname.startsWith('/knowledge') ? '/knowledge' : '/agent';

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
          <Typography.Title level={3} className="app-title">
            Echo Assistant
          </Typography.Title>
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          className="app-nav"
          items={[
            {
              key: '/agent',
              label: <NavLink to="/agent">Agent 助手</NavLink>
            },
            {
              key: '/knowledge',
              label: <NavLink to="/knowledge">知识管理</NavLink>
            }
          ]}
        />
      </Header>
      <Content className="app-content">
        <Routes>
          <Route path="/" element={<Navigate to="/agent" replace />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
        </Routes>
      </Content>
    </Layout>
  );
}
