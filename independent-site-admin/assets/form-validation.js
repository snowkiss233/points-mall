/* 表单交互校验：接收原始输入，不依赖 DOM，也不修改草稿。 */
const FormValidation = (() => {
  const empty = value => value == null || typeof value === 'string' && !value.trim();
  const selected = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
  const numeric = value => !empty(value) && ['string','number'].includes(typeof value) && Number.isFinite(Number(value));
  const error = (field, message) => ({field, message});

  function richText(value) {
    return String(value ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:nbsp|ensp|emsp|thinsp);/gi, ' ')
      .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code) => {
        const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
        return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
      })
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .trim();
  }

  // 原生 date / datetime-local 的值格式；独立检查年月日，避免 Date 自动进位。
  function dateValue(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
    if (!match) return null;
    const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '0'] = match;
    const y = Number(year), m = Number(month), d = Number(day), h = Number(hour), min = Number(minute), sec = Number(second);
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() || h > 23 || min > 59 || sec > 59) return null;
    const date = new Date(0);
    date.setUTCFullYear(y, m - 1, d);
    date.setUTCHours(h, min, sec, Number(fraction.padEnd(3, '0')));
    return date.getTime();
  }

  function validate(key, draft, fields, {hiddenFields = [], currencies = []} = {}) {
    const hidden = new Set(hiddenFields);
    const visible = label => !hidden.has(label);
    for (const field of fields) {
      const label = field.label;
      if (!visible(label)) continue;
      const value = draft[label];
      if (field.type === 'range') {
        const range = Array.isArray(value) ? value : [];
        const startEmpty = empty(range[0]), endEmpty = empty(range[1]);
        if (field.required && (startEmpty || endEmpty) || !startEmpty !== !endEmpty) return error(label, `请完整填写${label}的开始和结束时间`);
        if (startEmpty && endEmpty) {
          if (!empty(value) && (!Array.isArray(value) || value.length && value.length !== 2)) return error(label, `${label}的时间格式无效`);
          continue;
        }
        if (range.length !== 2) return error(label, `${label}的时间格式无效`);
        const start = dateValue(range[0]), end = dateValue(range[1]);
        if (start === null || end === null) return error(label, `${label}的时间格式无效`);
        if (start > end) return error(label, `${label}的结束时间不能早于开始时间`);
        continue;
      }
      if (field.type === 'multi' || field.type === 'productPicker') {
        if (field.required && !selected(value).length) return error(label, field.type === 'productPicker' ? '请至少选择一个商品' : `请选择${label}`);
        if (!empty(value) && !Array.isArray(value)) return error(label, `${label}的选项格式无效`);
        continue;
      }
      if (field.type === 'richtext') {
        if (field.required && !richText(value)) return error(label, `请填写${label}`);
        continue;
      }
      if (field.required && empty(value)) return error(label, `请填写${label}`);
      if (empty(value)) continue;
      if (field.type === 'number' && (!numeric(value) || Number(value) < 0)) return error(label, `${label}须为非负有限数字`);
      if (['date','datetime-local'].includes(field.type) && dateValue(value) === null) return error(label, `${label}的时间格式无效`);
    }

    if (key === 'products' && visible('选择商品') && draft['商品类型'] === '组合商品' && !selected(draft['选择商品']).length) return error('选择商品', '请至少选择一个组合商品');
    if (key === 'promotions' && visible('折扣') && (!numeric(draft['折扣']) || Number(draft['折扣']) <= 0 || Number(draft['折扣']) > 1)) return error('折扣', '折扣须大于 0 且不超过 1，例如 0.85 表示 8.5 折');
    const limits = selected(draft['权限限制']);
    if (key === 'blacklist' && visible('权限限制') && limits.includes('解除拉黑') && limits.length > 1) return error('权限限制', '解除拉黑不能与其他限制同时选择');

    if (visible('币种价格')) {
      if (!Array.isArray(currencies)) return error('币种价格', '币种价格格式无效');
      const used = new Set();
      for (const [index, currency] of currencies.entries()) {
        const prefix = `第 ${index + 1} 行币种`;
        if (!currency || typeof currency !== 'object' || !['N币','雷神币'].includes(currency.currency)) return error('币种价格', `${prefix}请选择有效币种`);
        if (used.has(currency.currency)) return error('币种价格', '同一币种不能重复添加');
        used.add(currency.currency);
        for (const [name, label] of [['price','售价'],['original','原价']]) {
          if (empty(currency[name])) return error('币种价格', `请填写${prefix}${label}`);
          if (!numeric(currency[name]) || Number(currency[name]) < 0) return error('币种价格', `${prefix}${label}须为非负有限数字`);
        }
      }
    }
    return null;
  }

  return {validate};
})();
