import { backendFetch } from './api.js';

function parseOrExpression(expression) {
  return String(expression).split(',').map((part) => {
    const [column, operator, ...valueParts] = part.split('.');
    if (!column || !['eq', 'ilike'].includes(operator) || !valueParts.length) {
      throw new Error('Filtro de pesquisa inválido.');
    }
    return { column, operator, value: valueParts.join('.') };
  });
}

class QueryBuilder {
  constructor(resource) {
    this.request = {
      resource,
      operation: 'select',
      columns: '*',
      filters: [],
      orders: [],
      limit: 500,
      single: false,
      returning: false
    };
  }

  select(columns = '*') {
    this.request.columns = columns;
    if (this.request.operation !== 'select') this.request.returning = true;
    return this;
  }

  insert(payload) {
    this.request.operation = 'insert';
    this.request.payload = payload;
    return this;
  }

  update(payload) {
    this.request.operation = 'update';
    this.request.payload = payload;
    return this;
  }

  delete() {
    this.request.operation = 'delete';
    return this;
  }

  eq(column, value) { return this.filter('eq', column, value); }
  is(column, value) { return this.filter('is', column, value); }
  in(column, value) { return this.filter('in', column, value); }
  ilike(column, value) { return this.filter('ilike', column, value); }
  gte(column, value) { return this.filter('gte', column, value); }
  lte(column, value) { return this.filter('lte', column, value); }

  filter(operator, column, value) {
    this.request.filters.push({ operator, column, value });
    return this;
  }

  or(expression) {
    this.request.filters.push({ operator: 'or', conditions: parseOrExpression(expression) });
    return this;
  }

  order(column, options = {}) {
    this.request.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(value) {
    this.request.limit = value;
    return this;
  }

  single() {
    this.request.single = true;
    this.request.returning = true;
    return this;
  }

  async execute() {
    try {
      const data = await backendFetch('/data/query', {
        method: 'POST',
        body: JSON.stringify(this.request)
      });
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

const database = Object.freeze({
  from(resource) {
    return new QueryBuilder(resource);
  },
  async rpc(name, parameters = {}) {
    try {
      const data = await backendFetch(`/operations/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify(parameters)
      });
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
});

export async function getDatabase() {
  return database;
}
