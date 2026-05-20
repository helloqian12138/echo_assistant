import { getOpenAIConfig } from '../config/openai.config.js';
import { knowledgeService } from './knowledge.service.js';
import { orderService } from './order.service.js';

class ReadinessService {
  async getStatus() {
    const knowledge = await knowledgeService.status();
    const tool = orderService.status();

    return {
      knowledge: {
        ready: knowledge.ready,
        label: knowledge.ready ? '知识库已准备' : '知识库未准备',
        documents: knowledge.documents,
        chunks: knowledge.chunks
      },
      model: this.getModelStatus(),
      tools: {
        ready: tool.ready,
        label: tool.ready ? '订单查询工具已准备' : '订单查询工具未准备',
        items: [
          {
            name: tool.toolName,
            ready: tool.ready,
            description: '从后端 CSV mock 数据中查询订单状态、签收时间、VIP 信息和商品信息'
          }
        ]
      }
    };
  }

  private getModelStatus() {
    try {
      const config = getOpenAIConfig();
      return {
        ready: true,
        label: '模型配置已准备',
        model: config.model,
        baseURL: config.baseURL ?? 'OpenAI default'
      };
    } catch (error) {
      return {
        ready: false,
        label: error instanceof Error ? error.message : '模型配置未准备',
        model: null,
        baseURL: null
      };
    }
  }
}

export const readinessService = new ReadinessService();
