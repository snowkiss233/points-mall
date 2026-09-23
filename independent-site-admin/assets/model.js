/* 原型数据规则。仅处理本地演示数据，不连接真实业务接口。 */
const Model = (() => {
  const VERSION = 9;
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
    for (const f of fields(key)) if (typeof f.options === 'string') result[f.label] = {target:f.options, multi:f.type === 'multi'};
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

  function refresh(db) {
    for (const [key, schema] of Object.entries(SCHEMA)) {
      if (!schema.columns) continue;
      for (const row of db[key] || []) for (const [label, relation] of Object.entries(relations(key, row))) {
        const value = row.refs?.[label];
        row[label] = relation.multi ? (value || []).map(id => name(relation.target, get(db, relation.target, id))) : name(relation.target, get(db, relation.target, value));
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
    for (const row of db.recommend) row['渠道Code'] = (row.refs?.['生效渠道'] || []).map(id => get(db, 'channels', id)?.['渠道代码'] || '').join(',');
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
    if (target === 'permissions') for (const [role, ids] of Object.entries(db.rolePermissions)) if (ids.includes(id)) add(`角色授权：${name('roles',get(db,'roles',role))}`);
    return result;
  }

  function matches(db, key, row, label, value, filter) {
    if (!value || Array.isArray(value) && !value.some(Boolean)) return true;
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
    if (!object(db) || ![1,2,3,4,5,6,7,8,VERSION].includes(db.version)) return ['不支持的备份版本'];
    const collections = [...Object.keys(SCHEMA).filter(k => SCHEMA[k].columns), 'productSuppliers'];
    for (const key of collections) {
      if (key === 'searchHints' && db.version < 9 && db[key] === undefined) continue;
      if (!Array.isArray(db[key])) { errors.push(`${key} 必须是数组`); continue; }
      const ids = new Set();
      for (const row of db[key]) {
        if (!object(row) || !text(row.uid) || !/^[A-Za-z0-9_-]{1,100}$/.test(row.uid)) { errors.push(`${key} 的记录缺少有效 uid`); continue; }
        if (ids.has(row.uid)) errors.push(`${key} 的 uid 重复：${row.uid}`);
        ids.add(row.uid);
      }
    }
    for (const key of ['audit','queryLogs','exportJobs','statJobs','trash','outflows']) if (!Array.isArray(db[key]) || db[key].some(r => !object(r))) errors.push(`${key} 格式错误`);
    if (!object(db.rolePermissions) || Object.values(db.rolePermissions).some(ids => !Array.isArray(ids) || ids.some(id => !text(id)))) errors.push('角色授权格式错误');
    if (!object(db.authGlobal) || typeof db.authGlobal.enabled !== 'boolean' || !['全部','部分'].includes(db.authGlobal.scope) || !Array.isArray(db.authGlobal.modules) || db.authGlobal.modules.some(m => m !== '生成订单实名')) errors.push('全局实名认证配置格式错误');
    return errors;
  }

  function validate(db) {
    const errors = envelope(db);
    if (errors.length) return errors;
    const primary = {products:'商品名称',games:'游戏名称',tags:'标签',platforms:'平台名称',channels:'渠道名称',users:'用户UID',blacklist:'手机号',orders:'订单编号',refunds:'退款编号',suppliers:'供货商',sources:'商品名称',apiSources:'商品名称',batches:'ID',stock:'CDKEY',categories:'分类名称',subcategories:'分类名称',versions:'版本名称',promotions:'活动名称',payInfo:'支付通道名称',articles:'文章标题',recommend:'栏目名称',admins:'账号',roles:'角色名称',permissions:'权限名称',dict:'字典名称',dictItems:'value'};
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
        if (new Set(ids).size !== ids.length || ids.some(id => !text(id) || !get(db,relation.target,id))) fail(key,row,`${label}存在失效或重复关联`);
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
      if (!['启用','禁用'].includes(row['状态']) || typeof row['排序'] !== 'number' || row['排序'] < 0) errors.push('商品供货商状态或排序错误');
    }
    for (const [role, ids] of Object.entries(db.rolePermissions)) if (!get(db,'roles',role) || ids.some(id=>!get(db,'permissions',id))) errors.push('角色授权引用不存在');
    for (const item of db.trash) if (!SCHEMA[item.key]?.columns || !object(item.row) || !text(item.row.uid)) errors.push('回收站记录格式错误');
    if (typeof PhaseOne !== 'undefined') errors.push(...PhaseOne.validate(db));
    if (typeof AuthorizedLogin !== 'undefined') errors.push(...AuthorizedLogin.validate(db));
    return [...new Set(errors)];
  }

  function migrate(input) {
    const db = copy(input), issues = envelope(db);
    if (issues.length) throw new Error(issues.slice(0,5).join('；'));
    if (db.version === VERSION) return db;
    db.searchHints ||= [];
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
  return {VERSION,copy,uid,name,get,fields,relations,choices,formDraft,fromForm,promotionStatus,statusAction,stockRows,refresh,references,matches,validate,prepare,addStock,routeInfo,routeHref,parentContext};
})();
