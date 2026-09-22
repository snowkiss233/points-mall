/* 一期配置与本地演示规则。与真实站点、支付和风控服务隔离。 */
const PhaseOne = (() => {
  const modes = ['单人', '多人', '在线'];
  const sections = ['顶部banner', '热销商品', '游戏排行', '今日推荐', '大家都在玩', '新品上线', '本周热销', '最新上市', '高分榜单', '即将发售'];
  const riskCode = 'demo_order_payment_city';
  const riskKey = 'order_payment_same_city';
  const badgeCode = 'product_corner_badges';
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
  SCHEMA.tags.filters.push(F('标签类型', 'select', false, ['游戏类型', '游戏模式']));
  SCHEMA.tags.fields.unshift(F('标签类型', 'select', true, ['游戏类型', '游戏模式']));
  SCHEMA.tags.desc = '按游戏类型、游戏模式维护标签。存量标签统一归为游戏类型；模式演示值：单人、多人、在线。';
  const legacyIndex = SCHEMA.games.fields.findIndex(f => f.label === '游戏标签');
  SCHEMA.games.fields.splice(legacyIndex, 1, F('游戏类型', 'multi', false, 'tags'), F('游戏模式', 'multi', false, 'tags'), F('角标标签', 'select', false, 'dictItems'), F('发售状态', 'select', true, ['未发售', '已发售']));
  SCHEMA.games.columns = ['ID','游戏名称','发售状态','游戏类型','游戏模式','绑定平台','排序','状态'];
  SCHEMA.games.filters.push(F('发售状态', 'select', false, ['未发售','已发售']));
  SCHEMA.games.desc = '配置游戏发售状态、游戏类型与游戏模式。未发售游戏展示“敬请期待”。';
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
      game.refs['角标标签'] = badges.length === 1 ? badges[0] : '';
      if (badges.length === 1) migrated++;
      if (badges.length > 1) ambiguous++;
    }
    if (migrated || ambiguous || unmapped) db.audit.unshift({time:now(),operator:'原型升级',action:`角标位置迁移：${migrated} 个游戏继承原商品角标；${ambiguous} 个游戏存在多角标冲突、${unmapped} 个商品未关联游戏，未自动选择角标。原始数据保留在升级前备份中。`});
    if (db.version >= 3) return db;
    // 仅旧版数据进入；保留已有记录，新增演示实体使用独立 UID。
    const v1 = db.version === 1;
    db.tags.forEach(tag => { tag['标签类型'] = '游戏类型'; });
    const ensureTag = (name, type) => {
      let tag = db.tags.find(t => t['标签'] === name && t['标签类型'] === type);
      if (!tag) {
        tag = {uid:id(db,'tags','phase1-tag-'+db.tags.length),'标签':name,'标签类型':type,'排序值':db.tags.length+1,'状态':'开启','创建时间':now(),refs:{}};
        db.tags.push(tag);
      }
      return tag;
    };
    modes.forEach(name => ensureTag(name, '游戏模式'));
    for (const game of db.games) {
      const names = String(game['游戏标签'] || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      const tags = [...new Set(names)].map(name => ensureTag(name, '游戏类型'));
      game['发售状态'] = '已发售';
      game['游戏类型'] = tags.map(t => t['标签']);
      game['游戏模式'] = [];
      if (!v1) game.refs = {...game.refs,'游戏类型':tags.map(t => t.uid),'游戏模式':[]};
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
      const game = {uid:id(db,'games','phase1-game-'+index),ID:'GAME-PHASE1-'+index,'游戏名称':name,'游戏副标题':'虚构游戏，用于验收配置效果','发售状态':release,'游戏类型':[tag['标签']],'游戏模式':[mode['标签']],'游戏标签':'冒险','绑定平台':platform?[platform['平台名称']]:[],'生效平台':[],'排序':110-index,'状态':'启用','游戏介绍':'一期验收演示内容。','创建时间':now(),refs:{},_phase1Demo:true};
      while (db.games.some(g => g.ID === game.ID)) game.ID += '-demo';
      if (!v1) game.refs = {'游戏类型':[tag.uid],'游戏模式':[mode.uid],'角标标签':'','绑定平台':platform?[platform.uid]:[]};
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
    if (target !== 'tags' && target !== 'columns') return rows;
    const selected = list(draft[field]);
    const selectedIds = Array.isArray(draft[field]) ? selected : [draft[field]];
    return rows.filter(r => (target !== 'tags' || key !== 'games' || r['标签类型'] === field) && (draft._migrating || r[target === 'tags' ? '状态' : '栏目状态'] === (target === 'tags' ? '开启' : '启用') || selectedIds.includes(r.uid))).sort((a,b) => Number(a['排序值'] ?? a['排序'])-Number(b['排序值'] ?? b['排序']));
  }

  function formIssue(db,key,draft,old) {
    const issue = (field,message) => ({field,message});
    if (key === 'dict' && old && isBadge(db,old.uid) && draft['字典编号'] !== badgeCode) return issue('字典编号','角标标签使用固定字典编号');
    if (key === 'dictItems' && isBadge(db,draft.parentId)) {
      if (draft['key类型'] !== '文本') return issue('key类型','角标标签只能使用文本值');
      if (db.dictItems.some(r => r.parentId === draft.parentId && r.uid !== old?.uid && r.key === draft.key)) return issue('key','同一角标的字典项值不能重复');
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
      if (db.tags.some(r => r.uid !== old?.uid && r['标签类型'] === draft['标签类型'] && r['标签'].trim() === String(draft['标签']).trim())) return issue('标签','同一标签类型下名称不能重复');
      if (old && old['标签类型'] !== draft['标签类型'] && Model.references(db,'tags',old.uid).length) return issue('标签类型','该标签已被游戏引用，不能直接修改类型；请新建另一类型的标签');
    }
    if (key === 'games') {
      for (const field of ['游戏类型','游戏模式']) for (const tagId of list(draft[field])) {
        const tag = Model.get(db,'tags',tagId);
        if (!tag || tag['标签类型'] !== field) return issue(field,'请选择对应类型的有效标签');
        if (tag['状态'] !== '开启' && !list(old?.refs?.[field]).includes(tagId)) return issue(field,'停用标签不能新增绑定');
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
    const badgeDict = db.dict.find(r => r['字典编号'] === badgeCode);
    if (!badgeDict) errors.push('角标标签字典缺失');
    const badgeItems = db.dictItems.filter(r => r.parentId === badgeDict?.uid);
    if (new Set(badgeItems.map(r => r.key)).size !== badgeItems.length || badgeItems.some(r => r['key类型'] !== '文本')) errors.push('角标标签字典项值重复或类型错误');
    for (const game of db.games) if (game.refs?.['角标标签'] && !isBadge(db,Model.get(db,'dictItems',game.refs['角标标签'])?.parentId)) errors.push('角标标签关联到其他字典');
    const names = new Set();
    for (const tag of db.tags) {
      const signature = tag['标签类型'] + ':' + String(tag['标签']).trim();
      if (names.has(signature)) errors.push('标签管理：同一类型下名称重复');
      names.add(signature);
    }
    for (const game of db.games) {
      for (const field of ['游戏类型','游戏模式']) if (list(game.refs?.[field]).some(uid => Model.get(db,'tags',uid)?.['标签类型'] !== field)) errors.push('游戏的'+field+'关联类型不一致');
    }
    const codes = db.columns.map(r => r['栏目标识']);
    if (new Set(codes).size !== codes.length) errors.push('栏目标识不能重复');
    for (const item of db.dictItems.filter(r => isRisk(db,r.parentId))) if (item.key !== riskKey || item['key类型'] !== '文本') errors.push('飞码字典只能维护固定城市比较规则');
    if (db.dictItems.filter(r => isRisk(db,r.parentId) && r.key === riskKey).length > 1) errors.push('飞码城市规则重复');
    return errors;
  }

  function isRisk(db,parentId) { return Model.get(db,'dict',parentId)?.['字典编号'] === riskCode; }
  function isBadge(db,parentId) { return Model.get(db,'dict',parentId)?.['字典编号'] === badgeCode; }
  function productGames(db,product) {
    if (!product) return [];
    if (product['商品类型'] === '组合商品') return list(product['选择商品']).flatMap(uid => productGames(db,Model.get(db,'products',uid)));
    const game = Model.get(db,'games',product.refs?.['绑定游戏类别']);
    return game ? [game] : [];
  }
  function purchase(db,game,product) {
    const games = product ? productGames(db,product) : game ? [game] : [];
    if (!games.length) return {allowed:false,label:'暂无关联游戏',message:'请先关联游戏。'};
    if (games.some(g => g['发售状态'] === '未发售')) return {allowed:false,label:'敬请期待',message:'游戏尚未发售，购买暂未开放。'};
    if (games.some(g => g['状态'] !== '启用') || product && product['状态'] !== '上架') return {allowed:false,label:'暂不可购买',message:'游戏已停用或商品已下架。'};
    return {allowed:true,label:'立即购买',message:'游戏已发售，可继续购买演示。'};
  }
  function compareCities(db,orderCity,paymentCity) {
    const rule = db.dictItems.find(r => isRisk(db,r.parentId) && r.key === riskKey);
    if (!rule || rule['是否启用'] !== '启用') return {result:'规则已停用',detail:'当前不执行城市比较。'};
    if (!orderCity || !paymentCity) return {result:'无法判断',detail:'至少一侧城市无法识别，不判定为同城或异城。'};
    return orderCity === paymentCity ? {result:'同城',detail:'两侧规范化城市标识一致。'} : {result:'异城 · 命中规则',detail:'两侧城市不同；仅显示比较结果，处置动作待确认，不执行拦截或停发。'};
  }
  return {modes,sections,riskCode,riskKey,badgeCode,upgrade,choices,formIssue,validate,isRisk,isBadge,productGames,purchase,compareCities};
})();
