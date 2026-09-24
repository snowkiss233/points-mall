/* 一期配置与本地演示规则。与真实站点、支付和风控服务隔离。 */
const PhaseOne = (() => {
  const modes = ['单人', '多人', '在线'];
  const sections = ['顶部banner', '热销商品', '游戏排行', '今日推荐', '大家都在玩', '新品上线', '本周热销', '最新上市', '高分榜单', '即将发售'];
  const riskCode = 'demo_order_payment_city';
  const riskKey = 'order_payment_same_city';
  const badgeCode = 'product_corner_badges';
  const tagTypeCode = 'game_tag_types';
  const tagTypeDefinitions = [['游戏类型','game_type'],['游戏模式','game_mode']];
  // 正式文本由运营提供；当前仅用明确标识的占位内容演示预载，不包含自拟激活步骤。
  const steamActivationGuide = '【演示占位】Steam 激活指南正文待运营提供。';
  const searchInterval = 3000;
  const badgeLabels = [['热门','hot'],['推荐','recommended'],['新品','new'],['史低','historical_low'],['超史低','record_low'],['特惠','special_offer']];
  const now = () => new Date().toISOString();
  const copy = value => JSON.parse(JSON.stringify(value));
  const list = value => Array.isArray(value) ? value : [];
  const id = (db, key, preferred) => {
    let value = preferred, n = 1;
    while (db[key].some(r => r.uid === value)) value = preferred + '-' + n++;
    return value;
  };

  SCHEMA.tags.columns.splice(1, 0, '标签类型');
  SCHEMA.tags.filters.push(F('标签类型', 'select', false, 'dictItems'));
  SCHEMA.tags.fields.unshift(F('标签类型', 'select', true, 'dictItems'));
  SCHEMA.tags.desc = '标签类型由数据字典维护；同一类型内标签名称不可重复，不同类型允许同名。';
  const legacyIndex = SCHEMA.games.fields.findIndex(f => f.label === '游戏标签');
  SCHEMA.games.fields.splice(legacyIndex, 1, F('游戏标签', 'multi', false, 'tags'), F('角标标签', 'select', false, 'dictItems'), F('发售状态', 'select', true, ['未发售', '已发售']));
  SCHEMA.games.columns = ['ID','游戏名称','发售状态','游戏标签','绑定平台','排序','状态'];
  SCHEMA.games.filters.push(F('发售状态', 'select', false, ['未发售','已发售']));
  SCHEMA.games.desc = '配置游戏发售状态与游戏标签。标签按字典维护的类型分组，未发售游戏展示“敬请期待”。';
  SCHEMA.columns = {name:'栏目列表', columns:['栏目名称','栏目状态','排序','说明'], filters:[], fields:[F('栏目名称','readonly',true),F('栏目标识','readonly',true),F('栏目状态','select',true,EN),F('排序','number',true)], actions:['编辑','启禁'],statusKey:'栏目状态',desc:'复用现有栏目枚举。新增 7 个专区为附件候选演示，可排序、启停；正式名单待确认。'};
  SCHEMA.recommend.fields.find(f => f.label === '推荐区域').options = 'columns';
  SCHEMA.recommend.filters.push(F('推荐区域','select',false,'columns'));
  SCHEMA.dict.desc = '一期飞码配置：进入“飞码城市一致性（演示）”的字典配置，维护规则启停。';
  SCHEMA.dictItems.columns = ['value','key','是否启用','描述','排序值'];
  Object.assign(NAME_KEYS, {tags:'标签',columns:'栏目名称'});

  function upgrade(db) {
    // 移除已撤回的配置；审计历史及升级前备份保留。
    const removeRetiredFields = row => { delete row['站点路由']; delete row._phase1RoutePending; if (row.refs) delete row.refs['站点路由']; };
    db.games.forEach(removeRetiredFields);
    db.products.forEach(removeRetiredFields);
    db.trash.filter(item => ['games','products'].includes(item.key)).forEach(item => removeRetiredFields(item.row));
    let tagTypeDict = db.dict.find(r => r['字典编号'] === tagTypeCode);
    if (!tagTypeDict) {
      tagTypeDict = {uid:id(db,'dict','game-tag-types'),'字典名称':'标签类型','字典编号':tagTypeCode,'描述':'标签管理中的标签类型候选项。','字典群组':'商城配置',refs:{}};
      db.dict.push(tagTypeDict);
    }
    for (const [value,key] of tagTypeDefinitions) if (!db.dictItems.some(r => r.parentId === tagTypeDict.uid && r.key === key)) {
      db.dictItems.push({uid:id(db,'dictItems','game-tag-type-'+key),parentId:tagTypeDict.uid,value,key,'key类型':'文本','描述':'','排序值':tagTypeDefinitions.findIndex(x => x[1] === key)+1,'是否启用':'启用',refs:{}});
    }
    const typeItem = value => db.dictItems.find(r => r.parentId === tagTypeDict.uid && (r.uid === value || r.value === value || r.key === value));
    let tagSchemaMigrated = false;
    if (db.version !== 1) {
      for (const tag of db.tags) {
        tag.refs ||= {};
        const item = typeItem(tag.refs['标签类型']) || typeItem(tag['标签类型']) || typeItem('游戏类型');
        if (tag.refs['标签类型'] !== item.uid) tagSchemaMigrated = true;
        tag.refs['标签类型'] = item.uid;
      }
      for (const game of db.games) {
        game.refs ||= {};
        const merged = [...new Set([...list(game.refs['游戏标签']),...list(game.refs['游戏类型']),...list(game.refs['游戏模式'])])];
        if (game.refs['游戏类型'] || game.refs['游戏模式'] || !game.refs['游戏标签']) tagSchemaMigrated = true;
        game.refs['游戏标签'] = merged;
        delete game.refs['游戏类型'];
        delete game.refs['游戏模式'];
        delete game['游戏类型'];
        delete game['游戏模式'];
      }
    }
    if (tagSchemaMigrated) db.audit.unshift({time:now(),operator:'原型升级',action:'标签结构升级：标签类型改由数据字典维护；游戏的类型、模式关联合并为统一游戏标签关联。'});
    let badgeDict = db.dict.find(r => r['字典编号'] === badgeCode);
    const isNewBadgeDict = !badgeDict;
    if (!badgeDict) {
      badgeDict = {uid:id(db,'dict','product-badges'),'字典名称':'角标标签','字典编号':badgeCode,'描述':'游戏角标的可选标签。','字典群组':'商城配置',refs:{}};
      db.dict.push(badgeDict);
    }
    if (badgeDict['字典名称'] === '商品角标标签') badgeDict['字典名称'] = '角标标签';
    if (isNewBadgeDict) badgeLabels.forEach(([value,key],index) => {
      if (!db.dictItems.some(r => r.parentId === badgeDict.uid && r.key === key)) db.dictItems.push({uid:id(db,'dictItems','product-badge-'+key),parentId:badgeDict.uid,value,key,'key类型':'文本','描述':'','排序值':index+1,'是否启用':'启用',refs:{}});
    });
    const candidates = new Map();
    let ambiguous = 0, unmapped = 0;
    for (const product of db.products) {
      const previous = product.refs?.['商品角标标签'];
      const badges = Array.isArray(previous) ? previous.filter(Boolean) : previous ? [previous] : [];
      const gameId = product.refs?.['绑定游戏类别'];
      if (badges.length && !gameId) unmapped++;
      if (badges.length && gameId) candidates.set(gameId, [...(candidates.get(gameId) || []), ...badges]);
      delete product.refs?.['商品角标标签'];
      delete product['商品角标标签'];
    }
    for (const item of db.trash.filter(item => item.key === 'products')) {
      delete item.row.refs?.['商品角标标签'];
      delete item.row['商品角标标签'];
    }
    let migrated = 0;
    for (const game of db.games) {
      game.refs ||= {};
      const badges = [...new Set(candidates.get(game.uid) || [])];
      if (db.version < 7) game.refs['角标标签'] = badges.length === 1 ? badges[0] : '';
      if (badges.length === 1) migrated++;
      if (badges.length > 1) ambiguous++;
    }
    if (migrated || ambiguous || unmapped) db.audit.unshift({time:now(),operator:'原型升级',action:`角标位置迁移：${migrated} 个游戏继承原商品角标；${ambiguous} 个游戏存在多角标冲突、${unmapped} 个商品未关联游戏，未自动选择角标。原始数据保留在升级前备份中。`});
    if (db.version >= 3) return db;
    // 仅旧版数据进入；保留已有记录，新增演示实体使用独立 UID。
    const v1 = db.version === 1;
    db.tags.forEach(tag => { tag['标签类型'] = '游戏类型'; });
    const ensureTag = (name, type) => {
      const item = typeItem(type);
      let tag = db.tags.find(t => t['标签'] === name && (t.refs?.['标签类型'] === item.uid || t['标签类型'] === type));
      if (!tag) {
        tag = {uid:id(db,'tags','phase1-tag-'+db.tags.length),'标签':name,'标签类型':type,'排序值':db.tags.length+1,'状态':'开启','创建时间':now(),refs:{'标签类型':item.uid}};
        db.tags.push(tag);
      }
      tag.refs ||= {};
      tag.refs['标签类型'] = item.uid;
      return tag;
    };
    modes.forEach(name => ensureTag(name, '游戏模式'));
    for (const game of db.games) {
      const names = String(game['游戏标签'] || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      const tags = [...new Set(names)].map(name => ensureTag(name, '游戏类型'));
      game['发售状态'] = '已发售';
      game['游戏标签'] = tags.map(t => t['标签']);
      delete game['游戏类型'];
      delete game['游戏模式'];
      if (!v1) game.refs = {...game.refs,'游戏标签':tags.map(t => t.uid)};
    }
    const ensureColumn = (name, index) => {
      let column = db.columns.find(r => r['栏目名称'] === name);
      if (!column) {
        column = {uid:id(db,'columns','phase1-col-'+index),'栏目名称':name,'栏目状态':'启用','排序':index+1,refs:{}};
        db.columns.push(column);
      }
      column['栏目标识'] ||= 'section-' + column.uid;
      column['栏目状态'] ||= column['状态'] || '启用';
      column['排序'] = Number(column['排序'] || index+1);
      column['说明'] ||= index < 3 ? '原有栏目' : '一期候选演示枚举，待确认';
      return column;
    };
    sections.forEach(ensureColumn);
    db.columns.forEach((r,i) => ensureColumn(r['栏目名称'],i));
    for (const recommendation of db.recommend) {
      const column = ensureColumn(recommendation['推荐区域'],db.columns.length);
      if (!v1) recommendation.refs = {...recommendation.refs,'推荐区域':column.uid};
    }
    let risk = db.dict.find(r => r['字典编号'] === riskCode);
    if (!risk) {
      risk = {uid:id(db,'dict','phase1-risk'),'字典名称':'飞码城市一致性（演示）','字典编号':riskCode,'描述':'下单与支付城市比较；演示规则默认停用，命中后的处置待确认。','字典群组':'商城配置',refs:{}};
      db.dict.push(risk);
    }
    if (!db.dictItems.some(r => r.parentId === risk.uid && r.key === riskKey)) db.dictItems.push({uid:id(db,'dictItems','phase1-city-rule'),parentId:risk.uid,value:'下单与支付城市一致性',key:riskKey,'key类型':'文本','描述':'比较规范化城市标识。异城仅输出命中结果，无法识别时输出无法判断。','排序值':1,'是否启用':'禁用',refs:{}});

    const platform = db.platforms[0];
    for (const [index, name, release] of [[1,'星海远征（一期演示）','未发售'],[2,'边境回声（一期演示）','已发售']]) {
      const tag = ensureTag('冒险','游戏类型'), mode = ensureTag('单人','游戏模式');
      const game = {uid:id(db,'games','phase1-game-'+index),ID:'GAME-PHASE1-'+index,'游戏名称':name,'游戏副标题':'虚构游戏，用于验收配置效果','发售状态':release,'游戏标签':[tag['标签'],mode['标签']],'绑定平台':platform?[platform['平台名称']]:[],'生效平台':[],'排序':110-index,'状态':'启用','游戏介绍':'一期验收演示内容。','创建时间':now(),refs:{},_phase1Demo:true};
      while (db.games.some(g => g.ID === game.ID)) game.ID += '-demo';
      if (!v1) game.refs = {'游戏标签':[tag.uid,mode.uid],'角标标签':'','绑定平台':platform?[platform.uid]:[]};
      db.games.unshift(game);
    }
    db.audit.unshift({time:now(),operator:'原型升级',action:'一期升级：存量标签归为游戏类型，保留原标签与游戏关联；新增虚构游戏、候选栏目与停用的飞码演示规则。'});
    return db;
  }

  function choices(db,target,key,field,draft,rows) {
    if (target === 'dictItems' && key === 'games' && field === '角标标签') {
      const selected = draft[field];
      return rows.filter(r => isBadge(db,r.parentId) && (r['是否启用'] === '启用' || selected === r.uid)).sort((a,b) => Number(a['排序值'] || 0)-Number(b['排序值'] || 0));
    }
    if (target === 'dictItems' && key === 'tags' && field === '标签类型') {
      const selected = draft[field];
      return rows.filter(r => isTagType(db,r.parentId) && (r['是否启用'] === '启用' || selected === r.uid)).sort((a,b) => Number(a['排序值'] || 0)-Number(b['排序值'] || 0));
    }
    if (target !== 'tags' && target !== 'columns') return rows;
    let tagRows = rows;
    if (target === 'tags' && key === 'games' && field === '游戏标签' && draft._migrating && db.version === 1 && !draft._phase1Demo) tagRows = rows.filter(r => r['标签类型'] === '游戏类型');
    const selected = list(draft[field]);
    const selectedIds = Array.isArray(draft[field]) ? selected : [draft[field]];
    return tagRows.filter(r => {
      const selectedRow = selectedIds.includes(r.uid);
      const active = r[target === 'tags' ? '状态' : '栏目状态'] === (target === 'tags' ? '开启' : '启用');
      const typeActive = target !== 'tags' || Model.get(db,'dictItems',r.refs?.['标签类型'])?.['是否启用'] === '启用';
      return draft._migrating || active && typeActive || selectedRow;
    }).sort((a,b) => Number(a['排序值'] ?? a['排序'])-Number(b['排序值'] ?? b['排序']));
  }

  function formIssue(db,key,draft,old) {
    const issue = (field,message) => ({field,message});
    if (key === 'products' && draft['状态'] === '上架') {
      const saved = Model.fromForm(db,key,{...draft,uid:old?.uid || draft.uid});
      const sameGoods = old && saved['商品类型'] === old['商品类型'] && saved.refs?.['绑定游戏类别'] === old.refs?.['绑定游戏类别'] && JSON.stringify(saved['选择商品'] || []) === JSON.stringify(old['选择商品'] || []);
      const error = listingIssue(db,saved,old?.['状态'] !== '上架' || !sameGoods);
      if (error) return error;
    }
    if (key === 'searchHints' && (!Number.isSafeInteger(draft['排序']) || draft['排序'] < 0)) return issue('排序','排序请输入非负整数');
    if (key === 'dict' && old && isBadge(db,old.uid) && draft['字典编号'] !== badgeCode) return issue('字典编号','角标标签使用固定字典编号');
    if (key === 'dictItems' && isBadge(db,draft.parentId)) {
      if (draft['key类型'] !== '文本') return issue('key类型','角标标签只能使用文本值');
      if (db.dictItems.some(r => r.parentId === draft.parentId && r.uid !== old?.uid && r.key === draft.key)) return issue('key','同一角标的字典项值不能重复');
    }
    if (key === 'dict' && old && isTagType(db,old.uid) && draft['字典编号'] !== tagTypeCode) return issue('字典编号','标签类型使用固定字典编号');
    if (key === 'dictItems' && isTagType(db,draft.parentId)) {
      if (draft['key类型'] !== '文本') return issue('key类型','标签类型只能使用文本值');
      if (db.dictItems.some(r => r.parentId === draft.parentId && r.uid !== old?.uid && r.key === draft.key)) return issue('key','标签类型的字典项值不能重复');
      if (old && old.key !== draft.key && Model.references(db,'dictItems',old.uid).length) return issue('key','该标签类型已被引用，不能修改字典项值');
    }
    if (key === 'games') {
      const badgeId = draft['角标标签'];
      if (badgeId) {
        const badge = Model.get(db,'dictItems',badgeId);
        if (!badge || !isBadge(db,badge.parentId)) return issue('角标标签','请选择角标标签字典中的选项');
        if (badge['是否启用'] !== '启用' && old?.refs?.['角标标签'] !== badgeId) return issue('角标标签','停用角标不能新增绑定');
      }
    }
    if (key === 'tags') {
      const type = Model.get(db,'dictItems',draft['标签类型']);
      if (!type || !isTagType(db,type.parentId)) return issue('标签类型','请选择标签类型字典中的选项');
      if (type['是否启用'] !== '启用' && old?.refs?.['标签类型'] !== type.uid) return issue('标签类型','停用的标签类型不能新增选择');
      if (db.tags.some(r => r.uid !== old?.uid && r.refs?.['标签类型'] === draft['标签类型'] && r['标签'].trim() === String(draft['标签']).trim())) return issue('标签','同一标签类型下名称不能重复');
      if (old && old.refs?.['标签类型'] !== draft['标签类型'] && Model.references(db,'tags',old.uid).length) return issue('标签类型','该标签已被游戏引用，不能直接修改类型；请新建另一类型的标签');
    }
    if (key === 'games') {
      for (const tagId of list(draft['游戏标签'])) {
        const tag = Model.get(db,'tags',tagId);
        if (!tag || !isTagType(db,Model.get(db,'dictItems',tag.refs?.['标签类型'])?.parentId)) return issue('游戏标签','请选择有效的游戏标签');
        if ((tag['状态'] !== '开启' || Model.get(db,'dictItems',tag.refs?.['标签类型'])?.['是否启用'] !== '启用') && !list(old?.refs?.['游戏标签']).includes(tagId)) return issue('游戏标签','停用的标签或标签类型不能新增绑定');
      }
    }
    if (key === 'recommend') {
      const column = Model.get(db,'columns',draft['推荐区域']);
      if (!column || column['栏目状态'] !== '启用' && old?.refs?.['推荐区域'] !== column.uid) return issue('推荐区域','请选择已启用的栏目');
      if (column['栏目名称'] === '即将发售' && list(draft['选择商品']).some(uid => productGames(db,Model.get(db,'products',uid)).some(g => g['发售状态'] !== '未发售'))) return issue('选择商品','即将发售专区只能选择关联未发售游戏的商品');
    }
    if (key === 'dictItems' && isRisk(db,draft.parentId)) {
      if (draft.key !== riskKey || draft['key类型'] !== '文本') return issue('key','城市比较规则使用固定文本标识，不能修改规则标识或类型');
      if (db.dictItems.some(r => r.parentId === draft.parentId && r.uid !== old?.uid && r.key === riskKey)) return issue('key','该城市比较规则已存在，请编辑原规则');
    }
    return null;
  }

  function validate(db) {
    const errors = [];
    for (const row of db.searchHints || []) {
      if (typeof row['底纹文案'] !== 'string' || !row['底纹文案'].trim()) errors.push('搜索底纹文案不能为空');
      if (!Number.isSafeInteger(row['排序']) || row['排序'] < 0) errors.push('搜索底纹排序必须为非负整数');
    }
    const badgeDict = db.dict.find(r => r['字典编号'] === badgeCode);
    if (!badgeDict) errors.push('角标标签字典缺失');
    const badgeItems = db.dictItems.filter(r => r.parentId === badgeDict?.uid);
    if (new Set(badgeItems.map(r => r.key)).size !== badgeItems.length || badgeItems.some(r => r['key类型'] !== '文本')) errors.push('角标标签字典项值重复或类型错误');
    for (const game of db.games) if (game.refs?.['角标标签'] && !isBadge(db,Model.get(db,'dictItems',game.refs['角标标签'])?.parentId)) errors.push('角标标签关联到其他字典');
    const tagTypeDict = db.dict.find(r => r['字典编号'] === tagTypeCode);
    if (!tagTypeDict) errors.push('标签类型字典缺失');
    const tagTypeItems = db.dictItems.filter(r => r.parentId === tagTypeDict?.uid);
    if (new Set(tagTypeItems.map(r => r.key)).size !== tagTypeItems.length || tagTypeItems.some(r => r['key类型'] !== '文本')) errors.push('标签类型字典项值重复或类型错误');
    const names = new Set();
    for (const tag of db.tags) {
      if (!isTagType(db,Model.get(db,'dictItems',tag.refs?.['标签类型'])?.parentId)) errors.push('标签管理：标签类型关联无效');
      const signature = tag.refs?.['标签类型'] + ':' + String(tag['标签']).trim();
      if (names.has(signature)) errors.push('标签管理：同一类型下名称重复');
      names.add(signature);
    }
    for (const game of db.games) if (game.refs?.['游戏类型'] || game.refs?.['游戏模式']) errors.push('游戏仍包含旧标签关联字段');
    const codes = db.columns.map(r => r['栏目标识']);
    if (new Set(codes).size !== codes.length) errors.push('栏目标识不能重复');
    for (const item of db.dictItems.filter(r => isRisk(db,r.parentId))) if (item.key !== riskKey || item['key类型'] !== '文本') errors.push('飞码字典只能维护固定城市比较规则');
    if (db.dictItems.filter(r => isRisk(db,r.parentId) && r.key === riskKey).length > 1) errors.push('飞码城市规则重复');
    return errors;
  }

  function isRisk(db,parentId) { return Model.get(db,'dict',parentId)?.['字典编号'] === riskCode; }
  function isBadge(db,parentId) { return Model.get(db,'dict',parentId)?.['字典编号'] === badgeCode; }
  function isTagType(db,parentId) { return Model.get(db,'dict',parentId)?.['字典编号'] === tagTypeCode; }
  function searchHintRows(db) {
    return [...(db.searchHints || [])].filter(r=>r['状态']==='启用'&&String(r['底纹文案']||'').trim()).sort((a,b)=>a['排序']-b['排序']||String(a['创建时间']||'').localeCompare(String(b['创建时间']||''))||a.uid.localeCompare(b.uid));
  }
  function searchHintAt(rows,elapsed=0) {
    return rows.length ? rows[Math.floor(Math.max(0,elapsed)/searchInterval)%rows.length]['底纹文案'] : '搜索游戏';
  }
  function guideForPlatforms(db,platformIds,currentText) {
    if (String(currentText||'').trim()) return currentText;
    const hasSteam=list(platformIds).some(uid=>String(Model.get(db,'platforms',uid)?.['平台名称']||'').trim().toLowerCase()==='steam');
    return hasSteam ? steamActivationGuide : currentText || '';
  }
  function refresh(db) {
    for (const game of db.games) game['游戏标签'] = list(game.refs?.['游戏标签']).map(uid => {
      const tag = Model.get(db,'tags',uid);
      return tag ? `${tag['标签类型']}：${tag['标签']}` : '';
    }).filter(Boolean);
  }
  function productGames(db,product) {
    if (!product) return [];
    if (product['商品类型'] === '组合商品') return list(product['选择商品']).flatMap(uid => productGames(db,Model.get(db,'products',uid)));
    const game = Model.get(db,'games',product.refs?.['绑定游戏类别']);
    return game ? [game] : [];
  }
  function listedProducts(db,gameId) {
    return db.products.filter(p=>p['状态']==='上架' && productGames(db,p).some(g=>g.uid===gameId));
  }
  function applyReleaseChange(db,old,game,time) {
    if (!old || old['发售状态'] !== '未发售' || game['发售状态'] !== '已发售') return [];
    Model.refresh(db);
    const affected = listedProducts(db,game.uid).filter(p=>!(Number(p['库存']) > 0));
    for (const product of affected) {
      product['状态'] = '下架';
      product['更新时间'] = time;
      db.audit.unshift({time,action:`游戏“${game['游戏名称']}”由未发售改为已发售，商品“${product['商品名称']}”（${product['商品ID'] || product.uid}）因无可用库存自动下架`,operator:'演示运营'});
    }
    return affected;
  }
  function purchase(db,game,product) {
    const games = product ? productGames(db,product) : game ? [game] : [];
    if (!games.length) return {allowed:false,label:'暂无关联游戏',message:'请先关联游戏。'};
    if (games.some(g => g['发售状态'] === '未发售')) return {allowed:false,label:'敬请期待',message:'游戏尚未发售，购买暂未开放。'};
    if (games.some(g => g['状态'] !== '启用') || product && product['状态'] !== '上架') return {allowed:false,label:'暂不可购买',message:'游戏已停用或商品已下架。'};
    const supplyError = product && listingIssue(db,product);
    if (supplyError) return {allowed:false,label:'暂不可购买',message:supplyError.message};
    return {allowed:true,label:'立即购买',message:'游戏已发售，可继续购买演示。'};
  }
  function listingIssue(db,product,checkStock=true) {
    const issue = (field,message) => ({field,message});
    if (product['商品类型'] === '组合商品') {
      const ids = list(product['选择商品']);
      if (!ids.length) return issue('选择商品','请先选择组成商品');
      for (const uid of ids) {
        const child = Model.get(db,'products',uid);
        if (!child || child['商品类型'] !== '独立商品') return issue('选择商品','请选择有效的独立商品');
        if (child['状态'] !== '上架') return issue('选择商品',`${child['商品名称']}尚未上架，请先上架组成商品`);
        const error = listingIssue(db,child,checkStock);
        if (error) return issue('选择商品',`${child['商品名称']}：${error.message}`);
      }
      return null;
    }
    const game = Model.get(db,'games',product.refs?.['绑定游戏类别']);
    if (!game) return issue('绑定游戏类别','请先选择有效的关联游戏');
    if (game['发售状态'] === '未发售') return null;
    if (game['发售状态'] !== '已发售') return issue('绑定游戏类别','关联游戏的发售状态无效，请先维护游戏资料');
    if (!checkStock) return null;
    const sources = db.productSuppliers.filter(b=>b.productId===product.uid && b['状态']==='启用').flatMap(b=>{
      const source = Model.get(db,'sources',b.sourceId), supplier = Model.get(db,'suppliers',b.supplierId);
      return supplier && source?.parentId===supplier.uid ? [source] : [];
    });
    if (!sources.length) return issue('状态','已发售商品上架前须绑定并启用供货商。请先保存为下架，再通过“供货商管理”配置。');
    const hasStock = sources.some(source=>{
      if (source['状态'] !== '上架') return false;
      if (Model.get(db,'suppliers',source.parentId)?.['合作方式'] === '接口') return Number(source['商品库存']) > 0;
      const batchIds = new Set(db.batches.filter(b=>b.parentId===source.uid && b['状态']==='上架').map(b=>b.uid));
      return Model.stockRows(db,'source',source.uid).some(row=>row['状态']==='未使用' && batchIds.has(row.parentId));
    });
    return hasStock ? null : issue('状态','已发售商品上架前，已启用供货商的关联货源须有可用库存。');
  }
  function compareCities(db,orderCity,paymentCity) {
    const rule = db.dictItems.find(r => isRisk(db,r.parentId) && r.key === riskKey);
    if (!rule || rule['是否启用'] !== '启用') return {result:'规则已停用',detail:'当前不执行城市比较。'};
    if (!orderCity || !paymentCity) return {result:'无法判断',detail:'至少一侧城市无法识别，不判定为同城或异城。'};
    return orderCity === paymentCity ? {result:'同城',detail:'两侧规范化城市标识一致。'} : {result:'异城 · 命中规则',detail:'两侧城市不同；仅显示比较结果，处置动作待确认，不执行拦截或停发。'};
  }
  return {modes,sections,riskCode,riskKey,badgeCode,tagTypeCode,steamActivationGuide,searchInterval,searchHintRows,searchHintAt,guideForPlatforms,upgrade,choices,formIssue,validate,isRisk,isBadge,isTagType,refresh,productGames,listedProducts,applyReleaseChange,listingIssue,purchase,compareCities};
})();
