import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createChatModel, normalizeModelError } from './openai-client.js';
import { productService, type ProductRecord } from './product.service.js';

type Operator = 'eq' | 'neq' | 'gte' | 'lte' | 'contains';
type RuleCondition = {
  field: 'category' | 'stock' | 'grossMargin' | 'afterSaleRisk' | 'price' | 'tags' | 'targetUsers' | 'recommendScore';
  operator: Operator;
  value: string | number;
};
type RecommendationRuleDsl = {
  conditions: RuleCondition[];
  sort: Array<{ field: 'recommendScore' | 'grossMargin' | 'stock' | 'price'; direction: 'asc' | 'desc' }>;
  limit: number;
};
export type RecommendationRule = {
  id: string;
  name: string;
  naturalLanguage: string;
  dsl: RecommendationRuleDsl;
  validation: {
    level: 'pass' | 'warning' | 'fail';
    warnings: string[];
    estimatedMatches: number;
  };
  createdAt: string;
};

const ruleSchema = z.object({
  name: z.string().default('首页推荐规则'),
  dsl: z.object({
    conditions: z.array(
      z.object({
        field: z.enum(['category', 'stock', 'grossMargin', 'afterSaleRisk', 'price', 'tags', 'targetUsers', 'recommendScore']),
        operator: z.enum(['eq', 'neq', 'gte', 'lte', 'contains']),
        value: z.union([z.string(), z.number()])
      })
    ),
    sort: z
      .array(
        z.object({
          field: z.enum(['recommendScore', 'grossMargin', 'stock', 'price']),
          direction: z.enum(['asc', 'desc'])
        })
      )
      .default([{ field: 'recommendScore', direction: 'desc' }]),
    limit: z.number().default(6)
  }),
  warnings: z.array(z.string()).default([])
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.resolve(__dirname, '../../data/runtime');
const rulesPath = path.join(runtimeDir, 'recommendation-rules.json');

class RecommendationService {
  async listRules() {
    await ensureStore();
    return readRules();
  }

  async createRule(input: { name?: string; naturalLanguage: string }) {
    await ensureStore();
    const products = await productService.list();
    const parsed = await this.parseRule(input.naturalLanguage);
    const dsl = normalizeDsl(parsed.dsl);
    const validation = validateRule(dsl, products, parsed.warnings);
    const rule: RecommendationRule = {
      id: `R${Date.now()}`,
      name: input.name || parsed.name || '首页推荐规则',
      naturalLanguage: input.naturalLanguage,
      dsl,
      validation,
      createdAt: new Date().toISOString()
    };
    const rules = await readRules();
    await writeFile(rulesPath, JSON.stringify([...rules, rule], null, 2), 'utf8');
    return rule;
  }

  async recommend(userType = 'VIP 用户') {
    const products = await productService.list();
    const rules = await this.listRules();
    const rule = rules.at(-1);
    const items = rule ? applyRule(products, rule.dsl, userType) : products.sort((a, b) => b.recommendScore - a.recommendScore).slice(0, 6);
    return {
      rule,
      userType,
      items: items.map((product) => ({
        ...product,
        reason: buildReason(product, rule, userType)
      }))
    };
  }

  private async parseRule(naturalLanguage: string) {
    try {
      const model = createChatModel(0.1);
      const response = await model.invoke([
        new SystemMessage(
          [
            '你是电商推荐规则配置助手。把运营自然语言规则转换成 JSON。',
            '字段仅允许 category, stock, grossMargin, afterSaleRisk, price, tags, targetUsers, recommendScore。',
            'operator 仅允许 eq, neq, gte, lte, contains。',
            '返回格式：{"name":"...","dsl":{"conditions":[],"sort":[],"limit":6},"warnings":[]}',
            '只返回 JSON。'
          ].join('\n')
        ),
        new HumanMessage(naturalLanguage)
      ]);
      const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const json = content.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
      return ruleSchema.parse(JSON.parse(json));
    } catch (error) {
      const normalizedError = normalizeModelError(error);
      console.warn(normalizedError instanceof Error ? normalizedError.message : normalizedError);
      return createFallbackRule(naturalLanguage);
    }
  }
}

export const recommendationService = new RecommendationService();

async function ensureStore() {
  await mkdir(runtimeDir, { recursive: true });
  if (!existsSync(rulesPath)) {
    await writeFile(rulesPath, '[]', 'utf8');
  }
}

async function readRules() {
  const raw = await readFile(rulesPath, 'utf8');
  return JSON.parse(raw) as RecommendationRule[];
}

function createFallbackRule(naturalLanguage: string) {
  const conditions: RuleCondition[] = [];
  if (/智能家居|保温杯|家居/.test(naturalLanguage)) conditions.push({ field: 'category', operator: 'eq', value: '智能家居' });
  if (/库存/.test(naturalLanguage)) conditions.push({ field: 'stock', operator: 'gte', value: 20 });
  if (/毛利|利润/.test(naturalLanguage)) conditions.push({ field: 'grossMargin', operator: 'gte', value: 0.3 });
  if (/售后风险|风险/.test(naturalLanguage)) conditions.push({ field: 'afterSaleRisk', operator: 'neq', value: 'high' });
  if (/新人/.test(naturalLanguage)) conditions.push({ field: 'price', operator: 'lte', value: 199 });
  return ruleSchema.parse({
    name: '运营推荐规则',
    dsl: {
      conditions,
      sort: [{ field: 'recommendScore', direction: 'desc' }],
      limit: 6
    },
    warnings: conditions.length ? [] : ['规则过于宽泛，建议增加类目、库存、毛利或风险条件']
  });
}

function normalizeDsl(dsl: RecommendationRuleDsl): RecommendationRuleDsl {
  return {
    conditions: dsl.conditions ?? [],
    sort: dsl.sort?.length ? dsl.sort : [{ field: 'recommendScore', direction: 'desc' }],
    limit: Math.min(12, Math.max(1, Number(dsl.limit) || 6))
  };
}

function validateRule(dsl: RecommendationRuleDsl, products: ProductRecord[], aiWarnings: string[]) {
  const estimatedMatches = applyRule(products, dsl, 'VIP 用户').length;
  const warnings = [...aiWarnings];
  if (!dsl.conditions.some((item) => item.field === 'stock')) warnings.push('建议增加库存过滤，避免低库存商品被大量曝光');
  if (!dsl.conditions.some((item) => item.field === 'afterSaleRisk')) warnings.push('建议增加售后风险过滤，避免高风险商品进入营销位');
  if (estimatedMatches === 0) warnings.push('当前规则没有命中商品，需要放宽条件或补充商品');
  return {
    level: estimatedMatches === 0 ? 'fail' : warnings.length ? 'warning' : 'pass',
    warnings,
    estimatedMatches
  } as RecommendationRule['validation'];
}

function applyRule(products: ProductRecord[], dsl: RecommendationRuleDsl, userType: string) {
  return products
    .filter((product) => dsl.conditions.every((condition) => matchCondition(product, condition, userType)))
    .sort((left, right) => compareProducts(left, right, dsl))
    .slice(0, dsl.limit);
}

function matchCondition(product: ProductRecord, condition: RuleCondition, userType: string) {
  const value = condition.field === 'targetUsers' && condition.value === 'currentUser' ? userType : getField(product, condition.field);
  if (condition.operator === 'contains') return Array.isArray(value) && value.some((item) => String(item).includes(String(condition.value)));
  if (condition.operator === 'eq') return String(value) === String(condition.value);
  if (condition.operator === 'neq') return String(value) !== String(condition.value);
  if (condition.operator === 'gte') return Number(value) >= Number(condition.value);
  if (condition.operator === 'lte') return Number(value) <= Number(condition.value);
  return false;
}

function compareProducts(left: ProductRecord, right: ProductRecord, dsl: RecommendationRuleDsl) {
  for (const item of dsl.sort) {
    const diff = Number(getField(left, item.field)) - Number(getField(right, item.field));
    if (diff !== 0) return item.direction === 'asc' ? diff : -diff;
  }
  return right.recommendScore - left.recommendScore;
}

function getField(product: ProductRecord, field: RuleCondition['field'] | RecommendationRuleDsl['sort'][number]['field']) {
  return product[field as keyof ProductRecord] as string | number | string[];
}

function buildReason(product: ProductRecord, rule: RecommendationRule | undefined, userType: string) {
  const reasons = [`${product.category} 商品`, `推荐分 ${product.recommendScore}`, `库存 ${product.stock}`];
  if (product.targetUsers.includes(userType)) reasons.push(`匹配 ${userType}`);
  if (rule) reasons.push(`命中规则：${rule.name}`);
  return reasons.join('，');
}
