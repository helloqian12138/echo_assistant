import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type OrderRecord = {
  order_id: string;
  user_name: string;
  status: string;
  paid_at: string;
  shipped_at: string;
  delivered_at: string;
  amount: string;
  is_vip: string;
  item_name: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ordersPath = path.resolve(__dirname, '../../data/orders.csv');

class OrderService {
  async findById(orderId: string) {
    const orders = await this.list();
    return orders.find((order) => order.order_id.toLowerCase() === orderId.toLowerCase());
  }

  async list() {
    const csv = await readFile(ordersPath, 'utf8');
    return parseCsv(csv) as OrderRecord[];
  }

  status() {
    return {
      ready: existsSync(ordersPath),
      toolName: 'query_order',
      source: ordersPath
    };
  }
}

export const orderService = new OrderService();

function parseCsv(csv: string) {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(',');

  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}
