/* 列表与查询交互辅助；只读取现有出库记录，不生成业务数据。 */
const ListInteractions = (() => {
  const outflowColumns = Object.freeze(['CDKEY', '订单编号', '出库时间']);
  const outflowFilters = Object.freeze([
    Object.freeze({label:'CDKEY', type:'text'}),
    Object.freeze({label:'订单编号', type:'text'}),
    Object.freeze({label:'出库时间', type:'range'})
  ]);

  function outflowRows(db, route, filters = {}) {
    if (!route?.parent) return [];
    const contains = (value, query) => String(value ?? '').toLowerCase().includes(String(query ?? '').trim().toLowerCase());
    return (db.outflows || []).filter(row => {
      if ((route.source ? row.sourceId : row.parentId) !== route.parent) return false;
      if (!contains(row.CDKEY, filters.CDKEY) || !contains(row['订单编号'], filters['订单编号'])) return false;
      const [start, end] = Array.isArray(filters['出库时间']) ? filters['出库时间'] : [];
      if (!start && !end) return true;
      const date = String(row['出库时间'] || '').slice(0, 10);
      return Boolean(date) && (!start || date >= start.slice(0, 10)) && (!end || date <= end.slice(0, 10));
    });
  }

  function paginate(rows, requestedPage = 1, requestedSize = 10) {
    const pageSize = Number.isFinite(Number(requestedSize)) && Number(requestedSize) >= 1 ? Math.floor(Number(requestedSize)) : 10;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number.isFinite(Number(requestedPage)) ? Math.floor(Number(requestedPage)) : 1));
    return {total:rows.length, pages, page, pageSize, rows:rows.slice((page - 1) * pageSize, page * pageSize)};
  }

  // 从 type="button" 的重置动作调用，避免在 reset 事件中再次 reset 造成递归。
  function resetCardQuery(form, result) {
    if (form) form.reset();
    if (result) result.replaceChildren();
  }

  return {outflowColumns, outflowFilters, outflowRows, paginate, resetCardQuery};
})();
