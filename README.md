# Echo Assistant

Echo Assistant is an AI-powered enterprise workflow assistant focused on SOP understanding, knowledge retrieval, and workflow automation.

Built for real business scenarios such as:

- Customer support SOP assistant
- Internal knowledge base QA
- Operations workflow guidance
- AI-powered enterprise search

## Features

- Upload enterprise documents (txt / md / pdf)
- RAG-based knowledge retrieval
- Context-aware AI answers
- SOP-based response generation
- Source reference support
- Simple and extensible workflow architecture

## Tech Stack

- Frontend: React + Vite + Ant Design + TypeScript
- Backend: Express + TypeScript + LangChain + LangGraph + Zod + Dotenv
- OpenAI API
- RAG
- Vector Search

## Example Workflow

1. Upload company SOP or internal documents
2. Ask operational questions
3. AI retrieves related knowledge
4. AI generates actionable answers and suggestions

Example:

> User:
> Customer requests refund after 7 days. What should we do?

> Echo Assistant:
> According to the refund SOP, orders exceeding 7 days require manual approval from operations. Suggested response template has been generated.

## Project Goal

Echo Assistant is designed to help enterprises reduce repetitive manual work and transform traditional workflows into AI-native workflows.

## Future Plans

- Multi-agent workflow orchestration
- Approval workflow automation
- Tool calling support
- CRM / ERP integration
- Multi-modal document support
- Workflow memory & execution tracking

## Run Locally

```bash
npm install
cp server/.env.example server/.env
# edit server/.env and set OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
npm run dev
```

Frontend: http://localhost:5173

Backend: http://localhost:3001

## OpenAI Config

`server/.env` supports custom OpenAI-compatible API hosts:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_BASE_URL` can be either a host or a `/v1` base URL. The server normalizes `https://your-host` to `https://your-host/v1`.

## Project Structure

```text
client/
  src/
    App.tsx                 # Hello World page and ChatGPT call demo
server/
  src/
    app.ts                  # Express app entry and middleware injection
    apis/                   # API route definitions
    controllers/            # Request validation and business orchestration
    middlewares/            # App middleware and error handling
    services/               # Generic agent implementation
```

## API Demo

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"用一句话介绍 Echo Assistant"}'
```
