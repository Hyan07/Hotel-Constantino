export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? '25', 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginationMeta(total, { page, pageSize }) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
