# Echo Assistant

[English README](README.md)

**AI 原生企业工作流助手**

Echo Assistant 是面向企业运营、客服自动化、知识驱动任务执行和自然语言业务流程的 AI 原生工作流助手。

Echo Assistant 帮助团队使用 AI 自动化客服和运营工作流。

## 核心功能

### AI 客服助手

基于企业知识库回答客户和内部支持问题，并提供带来源依据的回复和面向工作流的处理建议。

### 自然语言工作流规则

将业务人员用自然语言描述的运营策略转换为可执行的工作流逻辑，让业务团队无需写代码即可配置规则。

### 工作流自动化

把知识检索、AI 推理、规则校验和工具调用串联成可复用的企业运营工作流。

## Demo 场景

当前 demo 使用电商运营作为示例场景：

- 售后和退款政策的客服问答
- 自然语言推荐和曝光规则
- 商品入库、字段补全和推荐结果预览

Echo Assistant 的产品定位不局限于电商。它面向更通用的企业工作流，可扩展到客服、运营、内部知识库、审批流程和其他流程密集型团队。

## 架构

```text
用户
  ↓
React 前端
  ↓
Node.js API
  ↓
AI 编排 / RAG
  ↓
工作流引擎
  ↓
业务工具与数据
```

## 截图

### 客服问答

![客服问答](docs/screenshots/customer-support-qa.png)

### 自然语言工作流规则

![自然语言工作流规则](docs/screenshots/workflow-rule-input.png)

### 结果预览

![结果预览](docs/screenshots/recommendation-results.png)

## 技术栈

- 前端：React + Vite + Ant Design + TypeScript
- 后端：Express + TypeScript + LangChain + LangGraph + Zod + Dotenv
- AI 编排：知识检索、流式响应和工具调用
- 本地 demo 数据：商品、推荐规则、知识文档和订单数据

## 示例工作流

1. 上传企业政策、SOP 或内部知识文档
2. 用自然语言提出客服或运营问题
3. Echo Assistant 检索相关知识并检查工作流上下文
4. Echo Assistant 生成可执行建议，或将运营规则转换为可执行的工作流逻辑

示例：

> 用户：订单 E1001 用户想退款，应该怎么处理？

> Echo Assistant：根据退款 SOP，超过 7 天的订单需要转人工审批；仍在可退周期内的订单可以生成退款处理建议，并同步预计处理时效。

## 本地运行

```bash
npm install
cp server/.env.example server/.env
# 编辑 server/.env，设置 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
npm run dev
```

前端：http://localhost:5173

后端：http://localhost:3001

## OpenAI 配置

`server/.env` 支持自定义 OpenAI 兼容 API 地址：

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_BASE_URL` 可以是 host，也可以是 `/v1` base URL。服务端会将 `https://your-host` 规范化为 `https://your-host/v1`。

## 项目结构

```text
client/
  src/
    App.tsx                 # 产品外壳和工作流场景页面
server/
  data/
    seed/ecommerce-sop.md   # 内置 demo SOP 知识
    orders.csv              # query_order 工具使用的 mock 订单数据
  src/
    app.ts                  # Express 应用入口和中间件注入
    apis/                   # API 路由定义
    controllers/            # 请求校验和业务编排
    middlewares/            # 应用中间件和错误处理
    services/               # Agent、知识库、商品和工作流服务
samples/
  product-intake-demo.xlsx
  smart-thermos-after-sales-sop.md
```

## API Demo

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"订单 E1001 用户想退款，应该怎么处理？","sessionId":"demo"}'
```

常用 API：

- `GET /api/readiness`：查看知识库、模型和工具准备状态
- `GET /api/knowledge`：列出知识文档
- `POST /api/knowledge`：新增知识文档，参数为 `{ "title": "...", "content": "..." }`
- `GET /api/knowledge/:id`：预览知识文档
- `DELETE /api/knowledge/:id`：删除上传的知识文档
- `POST /api/chat/stream`：通过 SSE 流式返回 Agent 状态、回答 token 和执行轨迹
- `POST /api/products/enrich`：为 demo 工作流补全商品入库字段
- `POST /api/recommendations/rules`：将自然语言 demo 规则转换为可执行推荐逻辑
- `GET /api/recommendations/feed`：基于已保存 demo 规则预览推荐结果
