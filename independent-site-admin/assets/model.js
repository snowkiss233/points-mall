/* 原型数据规则。仅处理本地演示数据，不连接真实业务接口。 */
const Model = (() => {
  const VERSION = 31;
  const ALL_CHANNELS = '__all_channels__';
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const fields = key => key === 'products' ? PRODUCT_FIELDS : SCHEMA[key]?.fields || [];
  const name = (key, row) => row?.[NAME_KEYS[key] || SCHEMA[key]?.columns?.[0]] || row?.uid || '';
  const get = (db, key, id) => (db[key] || []).find(row => row.uid === id);
  let sequence = 0;
  const uid = (prefix = 'local') => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`;

  function relations(key, row = {}) {
    const result = {};
    for (const f of fields(key)) if (typeof f.options === 'string') result[f.label] = {target:f.options, multi:f.type === 'multi' || f.type === 'productMulti'};
    if (key === 'articles') result['指定游戏/平台'] = {target:row['指定范围'] === '游戏' ? 'games' : 'platforms', multi:false};
    if (key === 'supplierCommission') result['供货商'] = {target:'suppliers', multi:false};
    return result;
  }

  function choices(db, target, key = '', field = '', draft = {}) {
    let list = [...(db[target] || [])];
    if (target === 'versions' && key === 'products') list = list.filter(r => r.parentId === draft['绑定游戏类别']);
    if (target === 'subcategories' && key === 'products') list = list.filter(r => r.parentId === draft['商品分类']);
    if (target === 'sources' && key === 'promotions') list = list.filter(r => r.parentId === draft['供应商']);
    if (target === 'permissions') {
      list = list.filter(r => r.uid !== draft.uid && r['菜单类型'] !== '按钮/权限');
      if (draft['菜单类型'] === '子菜单') list = list.filter(r => r['菜单类型'] === '一级菜单');
    }
    return typeof PhaseOne === 'undefined' ? list : PhaseOne.choices(db,target,key,field,draft,list);
  }

  function formDraft(db, key, row) {
    const result = copy(row);
    for (const [label, relation] of Object.entries(relations(key, row))) result[label] = copy(row.refs?.[label] ?? (relation.multi ? [] : ''));
    if (key === 'promotions') result['控制状态'] = row['控制状态'] || '禁用';
    return result;
  }

  function fromForm(db, key, draft) {
    const row = copy(draft);
    row.refs = {...row.refs};
    for (const [label, relation] of Object.entries(relations(key, row))) row.refs[label] = relation.multi ? (draft[label] || []) : (draft[label] || '');
    if (key === 'products') {
      if (row['商品类型'] === '组合商品') {
        for (const label of ['商品分类','商品子分类']) row.refs[label] = '';
        row['账号类型'] = row['货源卡密类型'] = '';
      } else row['选择商品'] = [];
    }
    if (key === 'articles' && row['指定范围'] === '不绑定') row.refs['指定游戏/平台'] = '';
    if (key === 'permissions' && row['菜单类型'] === '一级菜单') row.refs['父级菜单'] = '';
    if (key === 'payInfo' && !row['支付通道ID']) row['支付通道ID'] = uid('PAY-DEMO');
    if (key === 'promotions') row['状态'] = promotionStatus(row);
    if (key === 'supplierPay') row['客户端类型'] = row['支付渠道类型'] === 'PC客户端' ? 'PC端' : 'Web端';
    if (key === 'games' && typeof PhaseOne !== 'undefined') {
      row['游戏标签'] = (row.refs['游戏类型'] || []).map(id => get(db,'tags',id)?.['标签'] || '').join(',');
    }
    return row;
  }

  function promotionStatus(row, now = new Date()) {
    const control = row['控制状态'];
    if (control === '禁用') return '已禁用';
    const [start, end] = row['活动时间'] || [];
    if (end && new Date(end) < now) return '已过期';
    if (control === '暂停') return '已暂停';
    if (start && new Date(start) > now) return '待执行';
    return '执行中';
  }

  function statusAction(key, row) {
    if (key === 'promotions') {
      if (['已过期','已完成'].includes(promotionStatus(row))) return null;
      const next = row['控制状态'] === '启用' ? '禁用' : '启用';
      return {field:'控制状态', next, label:next};
    }
    const pair = key === 'tags' ? ['开启','关闭'] : ['products','sources','batches'].includes(key) ? ['上架','下架'] : ['启用','禁用'];
    const field = SCHEMA[key]?.statusKey || '状态';
    const next = row[field] === pair[0] ? pair[1] : pair[0];
    return {field, next, label:next};
  }

  function stockRows(db, dimension, id) {
    if (!id) return [];
    return db.stock.filter(row => dimension === 'source' ? row.sourceId === id : row.parentId === id);
  }

  function productSupplierBindings(db, productId) {
    return db.productSuppliers.filter(b => b.productId === productId).sort((a,b) => Number(a['排序'] || 0) - Number(b['排序'] || 0) || String(a.uid).localeCompare(String(b.uid)));
  }

  function resolveProductSupplier(db, productId, quantity = 1) {
    const product = get(db,'products',productId), bindings = productSupplierBindings(db,productId);
    if (!product) return null;
    const available = bindings.filter(b => {
      const source = get(db,'sources',b.sourceId);
      return b['状态'] === '启用' && source?.['状态'] === '上架' && Number(source['商品库存'] || 0) >= quantity;
    });
    if (product['货源切换模式'] === '自动切换') return available[0] || null;
    return available.find(b => b.sourceId === product['手动当前货源ID']) || null;
  }

  function refresh(db) {
    for (const [key, schema] of Object.entries(SCHEMA)) {
      if (!schema.columns) continue;
      for (const row of db[key] || []) for (const [label, relation] of Object.entries(relations(key, row))) {
        const value = row.refs?.[label];
        row[label] = relation.multi ? (value || []).map(id => key === 'recommend' && label === '生效渠道' && id === ALL_CHANNELS ? '全部渠道（含未来新增渠道）' : name(relation.target, get(db, relation.target, id))) : name(relation.target, get(db, relation.target, value));
      }
    }
    for (const batch of db.batches) batch['商品库存'] = stockRows(db, 'batch', batch.uid).filter(r => r['状态'] === '未使用').length;
    for (const source of db.sources) {
      if (get(db, 'suppliers', source.parentId)?.['合作方式'] === '导入') source['商品库存'] = db.batches.filter(b => b.parentId === source.uid && b['状态'] === '上架').reduce((n,b) => n + b['商品库存'], 0);
    }
    for (const product of db.products) {
      product['游戏类别ID'] = get(db, 'games', product.refs?.['绑定游戏类别'])?.ID || '';
      const bindings = db.productSuppliers.filter(b => b.productId === product.uid);
      product['供货商信息'] = [...new Set(bindings.map(b => name('suppliers', get(db, 'suppliers', b.supplierId))))].filter(Boolean).join('、') || '—';
      if (product['商品类型'] === '独立商品') {
        const ids = [...new Set(bindings.filter(b => b['状态'] === '启用').map(b => b.sourceId))];
        product['库存'] = ids.reduce((n,id) => { const source = get(db, 'sources', id); return n + (source?.['状态'] === '上架' ? Number(source['商品库存'] || 0) : 0); }, 0);
      }
    }
    for (const product of db.products.filter(p => p['商品类型'] === '组合商品')) {
      const selected = (product['选择商品'] || []).map(id => get(db, 'products', id));
      product['库存'] = selected.length ? Math.min(...selected.map(p => p?.['状态'] === '上架' ? Number(p['库存'] || 0) : 0)) : 0;
    }
    for (const row of db.recommend) row['渠道Code'] = (row.refs?.['生效渠道'] || []).includes(ALL_CHANNELS) ? '全部渠道' : (row.refs?.['生效渠道'] || []).map(id => get(db, 'channels', id)?.['渠道代码'] || '').join(',');
    for (const key of ['shopPay','supplierPay']) for (const row of db[key]) {
      const pay = get(db, 'payInfo', row.refs?.['支付通道名称']);
      if (pay) for (const label of ['支付通道ID','支付通道简称','商户号']) row[label] = pay[label];
    }
    for (const row of db.promotions) row['状态'] = promotionStatus(row);
    for (const row of db.apiSources) {
      const source = get(db, 'sources', row.uid);
      if (source) Object.assign(row, {'商品名称':source['商品名称'],'商品库存':source['商品库存'],'商品状态':source['状态']});
    }
    if (typeof PhaseOne !== 'undefined' && typeof PhaseOne.refresh === 'function') PhaseOne.refresh(db);
    return db;
  }

  function references(db, target, id) {
    const result = [];
    const add = value => { if (!result.includes(value)) result.push(value); };
    for (const [key, schema] of Object.entries(SCHEMA)) for (const row of db[key] || []) {
      if (key === target && row.uid === id) continue;
      if (schema.parent === target && row.parentId === id) add(`${schema.name}：${name(key,row)}`);
      for (const [label, relation] of Object.entries(relations(key, row))) if (relation.target === target && [row.refs?.[label]].flat().includes(id)) add(`${schema.name}：${name(key,row)}`);
      if (target === 'products' && (row['选择商品'] || []).includes(id)) add(`${schema.name}：${name(key,row)}`);
      if (target === 'platforms' && key === 'games' && (row['生效平台'] || []).some(p => p.platform === id)) add(`游戏平台映射：${name(key,row)}`);
    }
    for (const binding of db.productSuppliers) {
      const field = {products:'productId',suppliers:'supplierId',sources:'sourceId'}[target];
      if (field && binding[field] === id) add(`商品供货关联：${name('products',get(db,'products',binding.productId))}`);
    }
    for (const key of ['giftBlacklist','bundleBlacklist']) for (const row of db[key] || []) if (target === 'products' && row.productId === id) add(`${key==='giftBlacklist'?'购买赠送':'捆绑销售'}商品黑名单`);
    if (target === 'permissions') for (const [role, ids] of Object.entries(db.rolePermissions)) if (ids.includes(id)) add(`角色授权：${name('roles',get(db,'roles',role))}`);
    return result;
  }

  function matches(db, key, row, label, value, filter) {
    if (!value || Array.isArray(value) && !value.some(Boolean)) return true;
    if (filter?.type === 'multi') {
      const selected = Array.isArray(value) ? value : [value];
      const names = selected.map(id => typeof filter.options === 'string' ? name(filter.options,get(db,filter.options,id)) : id);
      return names.includes(String(row[label] || ''));
    }
    if (key === 'products' && label === '供货商') return db.productSuppliers.some(b => b.productId === row.uid && b.supplierId === value);
    if (typeof filter?.options === 'string') return [row.refs?.[label]].flat().includes(value);
    const actual = row[label];
    if (Array.isArray(value)) {
      const [start,end] = Array.isArray(actual) ? actual : [actual,actual];
      return (!value[0] || String(end || '').slice(0,10) >= value[0].slice(0,10)) && (!value[1] || String(start || '').slice(0,10) <= value[1].slice(0,10));
    }
    return filter?.type === 'select' ? String(actual ?? '') === value : String(actual ?? '').toLowerCase().includes(String(value).toLowerCase());
  }

  function envelope(db) {
    const errors = [];
    if (!object(db) || ![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,VERSION].includes(db.version)) return ['不支持的备份版本'];
    if (db.version < 12 && db.searchHints !== undefined && !Array.isArray(db.searchHints)) errors.push('旧搜索底纹数据必须是数组');
    const collections = [...Object.keys(SCHEMA).filter(k => SCHEMA[k].columns && (k !== 'searchPlaceholder' || db.version >= 23) && (!['gifts','bundles'].includes(k) || db.version >= 25)), 'productSuppliers'];
    for (const key of collections) {
      if (!Array.isArray(db[key])) { errors.push(`${key} 必须是数组`); continue; }
      const ids = new Set();
      for (const row of db[key]) {
        if (!object(row) || !text(row.uid) || !/^[A-Za-z0-9_-]{1,100}$/.test(row.uid)) { errors.push(`${key} 的记录缺少有效 uid`); continue; }
        if (ids.has(row.uid)) errors.push(`${key} 的 uid 重复：${row.uid}`);
        ids.add(row.uid);
      }
    }
    for (const key of ['audit','queryLogs','exportJobs','statJobs','trash','outflows']) if (!Array.isArray(db[key]) || db[key].some(r => !object(r))) errors.push(`${key} 格式错误`);
    if (db.version >= 26) for (const key of ['giftBlacklist','bundleBlacklist']) if (!Array.isArray(db[key]) || db[key].some(r => !object(r) || !text(r.uid) || !text(r.productId) || !['启用','禁用'].includes(r.status))) errors.push(`${key} 格式错误`);
    if (!object(db.rolePermissions) || Object.values(db.rolePermissions).some(ids => !Array.isArray(ids) || ids.some(id => !text(id)))) errors.push('角色授权格式错误');
    if (!object(db.authGlobal) || typeof db.authGlobal.enabled !== 'boolean' || !['全部','部分'].includes(db.authGlobal.scope) || !Array.isArray(db.authGlobal.modules) || db.authGlobal.modules.some(m => m !== '生成订单实名')) errors.push('全局实名认证配置格式错误');
    return errors;
  }

  function validate(db) {
    const errors = envelope(db);
    if (errors.length) return errors;
    const primary = {products:'商品名称',games:'游戏名称',tags:'标签',platforms:'平台名称',channels:'渠道名称',users:'用户UID',blacklist:'手机号',orders:'订单编号',refunds:'退款编号',suppliers:'供货商',sources:'商品名称',apiSources:'商品名称',batches:'ID',stock:'CDKEY',categories:'分类名称',subcategories:'分类名称',versions:'版本名称',promotions:'活动名称',payInfo:'支付通道名称',articles:'文章标题',recommend:'栏目名称',searchPlaceholder:'底纹文案',admins:'账号',roles:'角色名称',permissions:'权限名称',dict:'字典名称',dictItems:'value'};
    const fail = (key,row,message) => errors.push(`${SCHEMA[key]?.name || key} ${row.uid}：${message}`);
    for (const [key, schema] of Object.entries(SCHEMA)) for (const row of db[key] || []) {
      if (primary[key] && !text(row[primary[key]])) fail(key,row,`缺少有效的${primary[key]}`);
      if (schema.parent && (!text(row.parentId) || !get(db,schema.parent,row.parentId))) fail(key,row,'父级不存在');
      if (!object(row.refs)) fail(key,row,'关联信息格式错误');
      const rels = relations(key,row);
      for (const [label, relation] of Object.entries(rels)) {
        const value = row.refs?.[label];
        if (relation.multi ? !Array.isArray(value) : typeof value !== 'string') { fail(key,row,`${label}关联格式错误`); continue; }
        const ids = relation.multi ? value : value ? [value] : [];
        const allChannels = key === 'recommend' && label === '生效渠道' && ids.includes(ALL_CHANNELS);
        if (allChannels && ids.length !== 1) fail(key,row,`${label}选择全部时不能同时选择单独渠道`);
        if (new Set(ids).size !== ids.length || ids.some(id => !text(id) || (id === ALL_CHANNELS ? !allChannels : !get(db,relation.target,id)))) fail(key,row,`${label}存在失效或重复关联`);
      }
      if (key === 'bundles') {
        const prices = row['可选商品捆绑价'] || {}, selected = row.refs?.['可选商品'] || [];
        if (!object(prices) || Object.entries(prices).some(([id,value]) => !selected.includes(id) || typeof value !== 'number' || !Number.isFinite(value) || value < 0)) fail(key,row,'可选商品捆绑价格式错误');
      }
      for (const f of fields(key)) {
        const inactive = (key === 'products' && (row['商品类型'] === '组合商品' ? ['账号类型','货源卡密类型','商品分类','商品子分类'].includes(f.label) : ['选择商品','生效时间'].includes(f.label))) || (key === 'auth' && f.label === '选择模块' && row['生效范围'] === '全部') || (key === 'dictItems' && ((f.label === 'key' && row['key类型'] === '图片') || (f.label === 'key图片' && row['key类型'] !== '图片')));
        if (inactive) continue;
        const value = rels[f.label] ? row.refs?.[f.label] : row[f.label];
        if (f.required && (value == null || value === '' || Array.isArray(value) && !value.length)) fail(key,row,`缺少${f.label}`);
        if (value == null || value === '') continue;
        if (f.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) fail(key,row,`${f.label}必须是非负数字`);
        if (['text','textarea','richtext','readonly','image','video','date','datetime-local'].includes(f.type) && typeof value !== 'string') fail(key,row,`${f.label}必须是文本`);
        if (f.type === 'range' && (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== 'string') || value.every(Boolean) && (value.some(v => !Number.isFinite(Date.parse(v))) || value[0] > value[1]))) fail(key,row,`${f.label}时间范围错误`);
        if (f.type === 'multi' && !Array.isArray(value)) fail(key,row,`${f.label}必须是数组`);
        if (Array.isArray(f.options) && f.options.length && (f.type === 'select' || f.type === 'multi') && [value].flat().some(v => !f.options.includes(v))) fail(key,row,`${f.label}的选项无效`);
      }
      if (row['商品排序'] && (!object(row['商品排序']) || Object.values(row['商品排序']).some(v => typeof v !== 'number' || v < 0 || !Number.isFinite(v)))) fail(key,row,'商品排序格式错误');
      if (['products','recommend'].includes(key)) {
        if (!Array.isArray(row['选择商品']) || row['选择商品'].some(id => id === row.uid && key === 'products' || get(db,'products',id)?.['商品类型'] !== '独立商品')) fail(key,row,'组成/推荐商品关联无效');
      }
      if (key === 'products') {
        if (row.refs?.['版本'] && get(db,'versions',row.refs['版本'])?.parentId !== row.refs['绑定游戏类别']) fail(key,row,'版本不属于所选游戏');
        if (row.refs?.['商品子分类'] && get(db,'subcategories',row.refs['商品子分类'])?.parentId !== row.refs['商品分类']) fail(key,row,'子分类不属于所选分类');
        const prices = row['币种价格'];
        if (!Array.isArray(prices) || prices.some(p => !object(p) || !['N币','雷神币'].includes(p.currency) || [p.price,p.original].some(n => typeof n !== 'number' || n < 0 || !Number.isFinite(n))) || new Set(prices.map(p=>p.currency)).size !== prices.length) fail(key,row,'币种价格格式错误');
      }
      if (key === 'games' && (!Array.isArray(row['生效平台']) || row['生效平台'].some(p => !object(p) || !get(db,'platforms',p.platform) || typeof p.gameId !== 'string'))) fail(key,row,'平台映射无效');
      if (key === 'stock') {
        if (row.sourceId !== get(db,'batches',row.parentId)?.parentId) fail(key,row,'卡密与批次的货源不一致');
        if (!['未使用','已使用','已禁用'].includes(row['状态'])) fail(key,row,'库存状态无效');
      }
      if (key === 'sources' && get(db,'suppliers',row.parentId)?.['合作方式'] === '接口' && (typeof row['商品库存'] !== 'number' || !Number.isSafeInteger(row['商品库存']) || row['商品库存'] < 0)) fail(key,row,'接口库存必须是非负整数');
      if (key === 'batches' && get(db,'suppliers',get(db,'sources',row.parentId)?.parentId)?.['合作方式'] !== '导入') fail(key,row,'接口货源不能创建本地批次');
      if (key === 'promotions' && !(row['折扣'] > 0 && row['折扣'] <= 1)) fail(key,row,'折扣须大于 0 且不超过 1');
      if (key === 'promotions' && (row.refs?.['关联货源'] || []).some(id => get(db,'sources',id)?.parentId !== row.refs['供应商'])) fail(key,row,'货源不属于所选供应商');
      if (key === 'permissions' && row.refs?.['父级菜单']) {
        const parent = get(db,'permissions',row.refs['父级菜单']);
        if (parent?.uid === row.uid || row['菜单类型'] === '一级菜单' || parent?.['菜单类型'] === '按钮/权限' || row['菜单类型'] === '子菜单' && parent?.['菜单类型'] !== '一级菜单') fail(key,row,'父级菜单层级无效');
      }
    }
    for (const [key,label] of Object.entries({products:'商品ID',payInfo:'支付通道ID',games:'ID',roles:'角色ID',channels:'渠道代码',dict:'字典编号'})) {
      const values = db[key].map(row=>row[label]);
      if (values.some(v=>!text(v)) || new Set(values).size !== values.length) errors.push(`${SCHEMA[key].name} 的${label}缺失或重复`);
    }
    const bindings = new Set();
    if (new Set(db.stock.map(row=>row.CDKEY)).size !== db.stock.length) errors.push('库存卡密重复');
    for (const row of db.productSuppliers) {
      if (!get(db,'products',row.productId) || !get(db,'suppliers',row.supplierId) || get(db,'sources',row.sourceId)?.parentId !== row.supplierId) errors.push('商品供货商关联失效');
      const pair = `${row.productId}/${row.supplierId}`;
      if (bindings.has(pair)) errors.push('同一商品不能重复关联供货商');
      bindings.add(pair);
      if (!['启用','禁用'].includes(row['状态']) || !Number.isSafeInteger(row['排序']) || row['排序'] < 1) errors.push('商品供货商状态或排序错误');
    }
    for (const product of db.products) {
      if (!['手动切换','自动切换'].includes(product['货源切换模式'])) errors.push(`商品 ${product.uid}：货源切换模式无效`);
      const bindings = productSupplierBindings(db,product.uid), orders = bindings.map(b=>b['排序']);
      if (new Set(orders).size !== orders.length) errors.push(`商品 ${product.uid}：供货顺序不能重复`);
      if (product['手动当前货源ID'] && !bindings.some(b=>b.sourceId===product['手动当前货源ID'])) errors.push(`商品 ${product.uid}：当前货源未关联`);
    }
    for (const [key,label] of [['giftBlacklist','购买赠送黑名单'],['bundleBlacklist','捆绑销售黑名单']]) {
      const seen = new Set();
      for (const row of db[key]) {
        if (!get(db,'products',row.productId)) errors.push(`${label}包含不存在的商品`);
        if (!['启用','禁用'].includes(row.status)) errors.push(`${label}状态无效`);
        if (seen.has(row.productId)) errors.push(`${label}商品重复`);
        seen.add(row.productId);
      }
    }
    const giftBlocked = new Set((db.giftBlacklist || []).filter(r=>r.status==='启用').map(r=>r.productId));
    for (const row of db.gifts || []) if ((row.refs?.['关联购买商品'] || []).some(id=>giftBlocked.has(id))) errors.push(`购买赠送 ${row.uid}：关联商品已在启用的商品黑名单中`);
    const bundleBlocked = new Set((db.bundleBlacklist || []).filter(r=>r.status==='启用').map(r=>r.productId));
    for (const row of db.bundles || []) if ([row.refs?.['主商品'], ...(row.refs?.['可选商品'] || [])].some(id=>id && bundleBlocked.has(id))) errors.push(`捆绑销售商品 ${row.uid}：主商品或可选商品已在启用的商品黑名单中`);
    for (const [role, ids] of Object.entries(db.rolePermissions)) if (!get(db,'roles',role) || ids.some(id=>!get(db,'permissions',id))) errors.push('角色授权引用不存在');
    for (const item of db.trash) if (!SCHEMA[item.key]?.columns || !object(item.row) || !text(item.row.uid)) errors.push('回收站记录格式错误');
    if (typeof PhaseOne !== 'undefined') errors.push(...PhaseOne.validate(db));
    for (const row of db.searchPlaceholder || []) {
      if (!text(row['底纹文案'])) errors.push('搜索底纹文案不能为空');
      if (!['商品详情页','链接'].includes(row['跳转类型'])) errors.push('搜索底纹跳转类型无效');
      if (row['状态']==='启用' && row['跳转类型']==='商品详情页' && !get(db,'products',row.refs?.['跳转商品'])) errors.push('启用的商品详情页跳转必须选择有效商品');
      if (row['状态']==='启用' && row['跳转类型']==='链接' && !/^https?:\/\//i.test(String(row['外链地址']||''))) errors.push('启用的链接地址须以 http:// 或 https:// 开头');
      if (!Number.isSafeInteger(row['排序']) || row['排序']<0) errors.push('搜索底纹排序必须为非负整数');
    }
    if (typeof AuthorizedLogin !== 'undefined') errors.push(...AuthorizedLogin.validate(db));
    if (typeof Coupons !== 'undefined') errors.push(...Coupons.validate(db));
    if (typeof V123 !== 'undefined') errors.push(...V123.validate(db));
    return [...new Set(errors)];
  }

  function migrate(input) {
    const db = copy(input), issues = envelope(db);
    if (issues.length) throw new Error(issues.slice(0,5).join('；'));
    if (db.version === VERSION) return db;
    db.searchHints ||= [];
    // 本次只补充演示底纹；后续刷新不复活已删除的数据，也不覆盖运营配置。
    if (db.version < 10) db.searchHints.push(...makeSearchHintSeed().filter(sample=>!db.searchHints.some(row=>row.uid===sample.uid||row['底纹文案']===sample['底纹文案'])));
    if (db.version < 8 && typeof PhaseOne !== 'undefined') PhaseOne.upgrade(db);
    if (db.version < 4 && typeof AuthorizedLogin !== 'undefined') AuthorizedLogin.upgrade(db);
    if (db.version === 1) for (const [key, schema] of Object.entries(SCHEMA)) for (const row of db[key] || []) {
      row.refs = {};
      const draft = {...row,_migrating:true};
      for (const [label, relation] of Object.entries(relations(key,row))) {
        const old = row[label], values = relation.multi ? old || [] : old ? [old] : [];
        if (!Array.isArray(values)) throw new Error(`${schema.name}的${label}格式错误`);
        const ids = values.flatMap(value => {
          const matches = choices(db,relation.target,key,label,draft).filter(r=>name(relation.target,r) === value);
          // v1 演示种子将游戏本体错误关联到道具子分类。仅修复这一已知的可选关系。
          if (!matches.length && key === 'products' && label === '商品子分类' && value === '载具礼包' && draft['商品分类'] === '2') {
            db.audit.unshift({time:new Date().toISOString(),action:`数据迁移：清除 ${row['商品名称']} 不属于所选分类的子分类“载具礼包”`,operator:'原型迁移'});
            return [];
          }
          if (matches.length !== 1) throw new Error(`${schema.name}的${label}“${value}”无法唯一匹配，请修复旧备份`);
          return [matches[0].uid];
        });
        row.refs[label] = relation.multi ? ids : ids[0] || '';
        draft[label] = row.refs[label];
      }
      if (key === 'games') row['生效平台'] = (row['生效平台'] || []).map(p => {
        const matches = db.platforms.filter(r=>r['平台名称'] === p.platform);
        if (matches.length !== 1) throw new Error('游戏的生效平台无法匹配');
        return {...p, platform:matches[0].uid};
      });
      if (key === 'promotions') row['控制状态'] = ['禁用','已禁用'].includes(row['状态']) ? '禁用' : ['已暂停','暂停'].includes(row['状态']) ? '暂停' : '启用';
      if (key === 'sources') row['状态'] = ['上架','启用'].includes(row['状态']) ? '上架' : '下架';
      if (key === 'payInfo' && !row['支付通道ID']) row['支付通道ID'] = uid('PAY-DEMO');
    }
    if (db.version < 11 && typeof PhaseOne !== 'undefined') PhaseOne.upgradeProductFields(db);
    if (db.version < 12 && typeof PhaseOne !== 'undefined') PhaseOne.upgradeSearchHints(db);
    if (db.version >= 12) delete db.searchHints;
    for (const product of [...db.products,...db.trash.filter(item=>item.key==='products').map(item=>item.row)]) {
      if (product['发售时间'] == null || product['发售时间'] === '时间待定') product['发售时间'] = '';
    }
    if (typeof Coupons !== 'undefined') Coupons.upgrade(db);
    if (db.version < 22) {
      let adColumn = db.columns.find(row => row['栏目名称'] === '广告');
      if (!adColumn) {
        adColumn = {uid:uid('column-ad'), '栏目名称':'广告', refs:{}};
        db.columns.push(adColumn);
        db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'新增“广告”栏目类型；原推荐配置保留'});
      }
      adColumn['栏目标识'] ||= 'section-advertising';
      adColumn['栏目状态'] ||= adColumn['状态'] || '启用';
      adColumn['排序'] ||= Math.max(0,...db.columns.filter(row=>row!==adColumn).map(row=>Number(row['排序'])||0))+1;
      adColumn['说明'] ||= '广告配置类型；广告位置在推荐配置中选择。';
      adColumn.refs ||= {};
    }
    if (db.version < 23) {
      db.searchPlaceholder ||= [];
      const dict = db.dict.find(row=>row['字典编号']==='client_search_placeholders');
      const oldRows = db.dictItems.filter(row=>row.parentId===dict?.uid);
      for (const [index,row] of oldRows.entries()) db.searchPlaceholder.push({uid:row.uid,ID:'SEARCH-HINT-'+(index+1),底纹文案:row.value,跳转类型:'商品详情',跳转商品:'',外链地址:'',排序:Number(row['排序值'])||index+1,状态:'禁用',refs:{'跳转商品':''},'创建时间':row['创建时间']||new Date().toISOString(),'更新时间':row['更新时间']||new Date().toISOString()});
      db.dictItems=db.dictItems.filter(row=>row.parentId!==dict?.uid);
      if (dict) db.dict=db.dict.filter(row=>row.uid!==dict.uid);
      db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'将搜索底纹从数据字典迁移到独立配置菜单；保留文案和排序，旧配置置为禁用以等待补充跳转目标'});
    }
    if (db.version < 24) {
      for (const row of db.searchPlaceholder || []) {
        if (row['跳转类型']==='商品详情') row['跳转类型']='商品详情页';
        if (row['跳转类型']==='外链') row['跳转类型']='链接';
      }
      db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'调整搜索底纹跳转类型名称：商品详情页、链接'});
    }
    if (db.version < 25) {
      db.gifts ||= [];
      db.bundles ||= [];
      let parent = db.permissions.find(row=>row['权限名称']==='营销管理'&&row['菜单类型']==='一级菜单');
      if (!parent) {
        parent = {uid:uid('permission'), '权限名称':'营销管理','菜单类型':'一级菜单','组件':'Layout','路径':'/marketing/purchaseGifts','状态':'启用','创建时间':new Date().toISOString(),refs:{}};
        db.permissions.push(parent);
      }
      for (const key of ['gifts','bundles']) if (!db.permissions.some(row=>row['权限名称']===SCHEMA[key].name&&row['菜单类型']==='子菜单')) db.permissions.push({uid:uid('permission'),'权限名称':SCHEMA[key].name,'菜单类型':'子菜单','父级菜单':'营销管理','组件':key,'路径':ROUTES[key],'状态':'启用','创建时间':new Date().toISOString(),refs:{'父级菜单':parent.uid}});
      const admin=db.roles.find(row=>row['角色名称']==='管理员'), adminIds=admin&&(db.rolePermissions||{})[admin.uid]; if (adminIds) for (const row of db.permissions.filter(item=>item['权限名称']==='购买赠送'||item['权限名称']==='捆绑销售商品')) if (!adminIds.includes(row.uid)) adminIds.push(row.uid);
      db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'新增购买赠送与捆绑销售商品菜单；旧配置数据保留'});
    }
    if (db.version < 26) {
      db.giftBlacklist ||= [];
      db.bundleBlacklist ||= [];
      db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'新增购买赠送与捆绑销售商品的商品维度黑名单；旧配置数据保留'});
    }
    if (db.version < 27) {
      const sample=makeSeed();
      let adjustedBlacklist=false;
      for (const [key,records,labels] of [['giftBlacklist',db.gifts||[],['关联购买商品']],['bundleBlacklist',db.bundles||[],['主商品','可选商品']]]) {
        const configured=new Set(records.flatMap(row=>labels.flatMap(label=>{const value=row.refs?.[label];return Array.isArray(value)?value:value?[value]:[]})));
        for (const row of db[key]||[]) if (row.status==='启用'&&configured.has(row.productId)) {row.status='禁用';row.updatedAt=new Date().toISOString();adjustedBlacklist=true;}
      }
      for (const key of ['gifts','bundles']) {
        db[key] ||= [];
        const known=new Set(db[key].map(row=>row.uid));
        const blocked=new Set((db[ key==='gifts'?'giftBlacklist':'bundleBlacklist']||[]).filter(item=>item.status==='启用').map(item=>item.productId));
        for (const row of sample[key]) {
          if (known.has(row.uid)) continue;
          const linked=key==='gifts'?row.refs?.['关联购买商品']||[]:[row.refs?.['主商品'],...(row.refs?.['可选商品']||[])];
          if (linked.some(id=>blocked.has(id))) continue;
          db[key].push(copy(row));
        }
      }
      db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'补充购买赠送与捆绑销售商品演示存量数据；既有配置保留'});
      if (adjustedBlacklist) db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'历史黑名单与商品配置存在冲突，已将冲突黑名单置为禁用并保留记录'});
    }
    if (db.version < 29) {
      for (const product of db.products) {
        product['货源切换模式'] = '手动切换';
        const bindings = db.productSuppliers.filter(b=>b.productId===product.uid).sort((a,b)=>Number(a['排序']||0)-Number(b['排序']||0)||String(a.uid).localeCompare(String(b.uid)));
        bindings.forEach((binding,index)=>binding['排序']=index+1);
        product['手动当前货源ID'] = bindings.find(b=>b['状态']==='启用')?.sourceId || '';
      }
      db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'新增商品级货源切换模式与供货顺序；既有商品默认手动切换并保留原关联'});
    }
    if (db.version < 31 && typeof V123 !== 'undefined') V123.upgrade(db);
    db.version = VERSION;
    for (const item of db.trash) if (item.key === 'dict') item.row.refs = {};
    return db;
  }

  function prepare(input) {
    const db = migrate(input), errors = validate(db);
    if (errors.length) throw new Error(errors.slice(0,5).join('；'));
    return refresh(db);
  }

  function addStock(db, batchId, input) {
    const batch = get(db,'batches',batchId);
    if (!batch) throw new Error('批次不存在');
    const source = get(db,'sources',batch.parentId);
    if (get(db,'suppliers',source?.parentId)?.['合作方式'] !== '导入') throw new Error('接口供货不支持本地入库');
    const codes = input.split(/\r?\n/).map(s=>s.trim().replace(/^"|"$/g,'')).filter(s=>s && s !== 'CDKEY');
    if (!codes.length) throw new Error('请填写卡密');
    const existing = new Set(db.stock.map(s=>s.CDKEY));
    const fresh = [...new Set(codes)].filter(code=>!existing.has(code));
    db.stock.push(...fresh.map(code=>({uid:uid('stock'),parentId:batch.uid,sourceId:source.uid,CDKEY:code,'状态':'未使用',refs:{}})));
    refresh(db);
    return {added:fresh.length, skipped:codes.length-fresh.length};
  }

  function routeInfo(hash) {
    const [path,search=''] = hash.replace(/^#/,'').split('?');
    const key = Object.keys(ROUTES).find(k=>ROUTES[k] === path) || 'products';
    const q = new URLSearchParams(search), parent = q.get('parent') || '', source = key === 'stock' && q.get('source') === '1';
    return {key,parent,source,identity:`${key}:${parent}:${source?'source':'parent'}`};
  }
  function routeHref(key,parent='',source=false) {
    const q = new URLSearchParams();
    if (parent) q.set('parent',parent);
    if (source) q.set('source','1');
    return '#'+ROUTES[key]+(q.size?'?'+q.toString():'');
  }
  function parentContext(db, route) {
    const parentKey = route.key === 'stock' && route.source ? 'sources' : SCHEMA[route.key]?.parent;
    const parent = parentKey && get(db,parentKey,route.parent);
    return {parentKey,parent,valid:!parentKey || Boolean(parent)};
  }
  return {VERSION,ALL_CHANNELS,copy,uid,name,get,fields,relations,choices,formDraft,fromForm,promotionStatus,statusAction,stockRows,productSupplierBindings,resolveProductSupplier,refresh,references,matches,validate,prepare,addStock,routeInfo,routeHref,parentContext};
})();
