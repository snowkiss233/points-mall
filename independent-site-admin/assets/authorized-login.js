/* 授权登录配置与虚构账号演示。没有真实认证、短信、手机号查询或跨境传输。 */
const AuthorizedLogin = (() => {
  const code = 'authorized_login';
  const platforms = [{key:'nn',name:'NN'},{key:'leigod',name:'雷神加速器'}];
  const hashes = {nn:'a87ff679a2f3e71d9181a67b7542122c',leigod:'e4da3b7fbbce2345d7772b0674a318d5',unlinked:'1679091c5a880faf6fb5e6087eb1b2dc'};
  const samples = [
    {id:'nn-only',name:'样例 A · 仅 NN 有手机号',lookups:{nn:hashes.nn,leigod:null}},
    {id:'leigod-only',name:'样例 B · 仅雷神有手机号',lookups:{nn:null,leigod:hashes.leigod}},
    {id:'both',name:'样例 C · 两个平台都有手机号',lookups:{nn:hashes.nn,leigod:hashes.leigod}},
    {id:'neither',name:'样例 D · 两个平台均无手机号',lookups:{nn:null,leigod:null}},
    {id:'failed',name:'样例 E · 雷神查询失败',lookups:{nn:hashes.nn,leigod:'error'}},
    {id:'unlinked',name:'样例 F · NN 有手机号但未授权注册',lookups:{nn:hashes.unlinked,leigod:null}}
  ];
  const label = key => platforms.find(p => p.key === key)?.name || key;
  const isConfig = (db,id) => Model.get(db,'dict',id)?.['字典编号'] === code;
  const config = db => db.dict.find(d => d['字典编号'] === code);
  const enabled = (db,platform) => db.dictItems.some(i => isConfig(db,i.parentId) && i.key === platform && i['是否启用'] === '启用');
  function upgrade(db) {
    let parent = config(db);
    if (!parent) {
      parent = {uid:Model.uid('login-dict'),'字典名称':'授权登录开关','字典编号':code,'字典群组':'商城配置','字典类型':'字符串','描述':'分别控制 NN、雷神加速器的授权登录入口。关闭后不接受该来源的授权登录；历史账号保留。',refs:{}};
      db.dict.push(parent);
    }
    for (const p of platforms) if (!db.dictItems.some(i => i.parentId === parent.uid && i.key === p.key)) db.dictItems.push({uid:Model.uid('login-switch'),parentId:parent.uid,value:p.name+'授权登录',key:p.key,'key类型':'文本','是否启用':'禁用','排序值':p.key === 'nn' ? 1 : 2,'描述':'控制'+p.name+'授权入口，默认禁用；不删除历史账号，不控制手机号登录。',refs:{}});
    db.loginDemo ||= {bindings:[],phones:[]};
    db.audit.unshift({time:new Date().toISOString(),operator:'原型升级',action:'升级至 v4：移除游戏购买站点配置；新增 NN、雷神加速器授权登录字典和本地流程演示，保留现有业务配置。'});
  }
  function formIssue(db,key,draft,old) {
    if (key === 'dict' && old && isConfig(db,old.uid) && draft['字典编号'] !== code) return {field:'字典编号',message:'授权登录使用固定字典编号'};
    if (key !== 'dictItems' || !isConfig(db,draft.parentId)) return null;
    if (!platforms.some(p => p.key === draft.key) || draft['key类型'] !== '文本' || old && draft.key !== old.key) return {field:'key',message:'来源标识固定为 nn 或 leigod，请只调整是否启用'};
    if (db.dictItems.some(i => i.parentId === draft.parentId && i.uid !== old?.uid && i.key === draft.key)) return {field:'key',message:'该来源开关已存在，请编辑原配置'};
    return null;
  }
  function validate(db) {
    const errors = [], parent = config(db), data = db.loginDemo;
    if (!parent) errors.push('授权登录字典缺失');
    const items = db.dictItems.filter(i => i.parentId === parent?.uid);
    if (items.length !== 2 || platforms.some(p => items.filter(i => i.key === p.key).length !== 1) || items.some(i => i['key类型'] !== '文本' || !['启用','禁用'].includes(i['是否启用']))) errors.push('授权登录字典必须各保留一个 NN 和雷神开关');
    if (!data || !Array.isArray(data.bindings) || !Array.isArray(data.phones)) return [...errors,'登录演示数据格式错误'];
    const identities = new Set(), phones = new Set();
    for (const b of data.bindings) {
      if (!b || !platforms.some(p => p.key === b.platform) || !/^[a-f0-9]{32}$/.test(b.uidMd5) || !Model.get(db,'users',b.userId) || Object.keys(b).some(k => !['platform','uidMd5','userId'].includes(k))) {errors.push('授权账号关联无效');continue;}
      const identity = b.platform+':'+b.uidMd5;
      if (identities.has(identity)) errors.push('同一平台 UID 摘要不能关联多个账号');
      identities.add(identity);
    }
    for (const p of data.phones) {
      if (!p || !samples.some(s => s.id === p.sampleId) || !Model.get(db,'users',p.userId) || Object.keys(p).some(k => !['sampleId','userId'].includes(k))) {errors.push('手机号演示关联无效');continue;}
      if (phones.has(p.sampleId)) errors.push('同一样例手机号不能关联多个账号');
      phones.add(p.sampleId);
    }
    return errors;
  }
  const blocked = (status,message,extra={}) => ({ok:false,status,message,...extra});
  function createUser(db,source) {
    const uid = Model.uid('site-demo');
    const row = {uid,'用户UID':uid.toUpperCase(),'手机号':'未绑定','实名认证':'未认证','注册渠道标识':source,'注册渠道名称':label(source),'注册时间':new Date().toISOString(),'登录来源':label(source),'授权标识':'—',refs:{},_authorizedLoginDemo:true};
    db.users.unshift(row);
    return row;
  }
  function authorize(db,{platform,uidMd5,verified}) {
    if (!platforms.some(p => p.key === platform)) return blocked('invalid','授权来源无效。');
    if (!enabled(db,platform)) return blocked('disabled',label(platform)+'授权登录已关闭，历史账号仍保留。');
    // verified 仅为测试适配器提供的模拟结果，绝不是实际认证凭据。
    if (verified !== true) return blocked('unverified','授权校验未通过，不创建或登录账号。');
    if (typeof uidMd5 !== 'string' || !/^[a-fA-F0-9]{32}$/.test(uidMd5)) return blocked('invalid','UID MD5 格式错误。');
    const hash = uidMd5.toLowerCase(), existing = db.loginDemo.bindings.find(b => b.platform === platform && b.uidMd5 === hash);
    if (existing) return {ok:true,status:'reused',userId:existing.userId,message:'登录此前的授权账号，独立站 UID 保持不变。'};
    const user = createUser(db,platform);
    db.loginDemo.bindings.push({platform,uidMd5:hash,userId:user.uid});
    user['授权标识'] = hash;
    return {ok:true,status:'created',userId:user.uid,message:'使用来源平台及 UID MD5 注册独立站账号。'};
  }
  function phoneLogin(db,{sampleId,verified}) {
    if (verified !== true) return blocked('unverified','请先完成手机号验证；验证前不执行平台查询或登录。');
    const sample = samples.find(s => s.id === sampleId);
    if (!sample) return blocked('invalid','手机号样例无效。');
    const lookups = platforms.map(p => ({platform:p.key,hash:sample.lookups[p.key],userId:db.loginDemo.bindings.find(b => b.platform === p.key && b.uidMd5 === sample.lookups[p.key])?.userId}));
    if (lookups.some(r => r.hash === 'error')) return blocked('lookup-failed','平台查询未全部成功，请重试；不会按“未匹配”创建新账号。',{lookups});
    const linked = db.loginDemo.phones.find(p => p.sampleId === sampleId);
    const ids = [...new Set([...lookups.map(r => r.userId),linked?.userId].filter(Boolean))];
    if (ids.length > 1) return blocked('conflict','匹配到不同独立站账号，暂停登录。冲突处理规则待确认，不自动合并或选择。',{lookups,userIds:ids});
    if (!ids.length && lookups.some(r => r.hash)) return blocked('no-history','平台存在手机号，但尚未找到历史授权账号。请先从匹配平台完成授权登录。',{lookups});
    const user = ids.length ? Model.get(db,'users',ids[0]) : createUser(db,'手机号');
    if (!linked) db.loginDemo.phones.push({sampleId,userId:user.uid});
    user['手机号'] = '已验证（虚构样例）';
    return {ok:true,status:ids.length?'reused':'created',userId:user.uid,lookups,message:ids.length?'登录已匹配的历史账号，独立站 UID 保持不变。':'两平台均未匹配，注册独立站手机号演示账号。'};
  }
  SCHEMA.dict.desc = '授权登录开关：分别配置 NN 与雷神加速器；飞码字典：配置城市一致性规则。通过字典配置维护启停。';
  SCHEMA.users.columns.push('登录来源','授权标识');
  return {code,platforms,hashes,samples,label,isConfig,config,enabled,upgrade,formIssue,validate,authorize,phoneLogin};
})();
