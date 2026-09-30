/* 优惠券领域模型：本地原型数据，计价输入由交易侧提供；不连接真实支付。 */
const COUPON_PAGES = {
  coupons:{view:'templates',name:'优惠券模板',path:'/marketing/coupons',desc:'维护可复用的优惠规则；同一模板可创建多个人工或接口发放计划。'},
  couponGrants:{view:'batches',name:'优惠券发放',path:'/marketing/couponGrants',desc:'按计划配置发放方式、额度和时间，查看发放记录及逐人结果。'},
};
for(const [key,p] of Object.entries(COUPON_PAGES)){ROUTES[key]=p.path;SCHEMA[key]={name:p.name,desc:p.desc};}
GROUPS.splice(GROUPS.findIndex(g=>g[0]==='商品管理')+1,0,['营销管理',Object.keys(COUPON_PAGES)]);
const Coupons = (() => {
  const copy = v => JSON.parse(JSON.stringify(v));
  const now = () => new Date().toISOString();
  const get = (db,key,id) => db.couponData[key].find(r=>r.id===id);
  const id = p => Model.uid('CP-'+p);
  const assert = (value,message) => {if(!value)throw Error(message);};
  const int = n => Number.isSafeInteger(n)&&n>=0;
  const ms = t => Date.parse(t);
  const at = (t,days) => new Date(ms(t)+days*86400000).toISOString();
  const money = n => (n/100).toFixed(2);
  const date = t => t?new Date(t).toLocaleString('sv-SE',{hour12:false}):'—';
  function minor(v) {assert(/^\d+(\.\d{1,2})?$/.test(String(v)),'金额须为非负数字，最多两位小数');const n=Math.round(Number(v)*100);assert(int(n),'金额超出有效范围');return n;}
  const labels={DRAFT:'草稿',SCHEDULED:'待发放',ENABLED:'发放中',PAUSED:'暂停发放',CLOSED:'已结束',AVAILABLE:'可用',PENDING:'待生效',LOCKED:'锁定中',USED:'已使用',EXPIRED:'已过期',REVOKED:'已回收',SUCCESS:'成功',PARTIAL_SUCCESS:'部分成功',FAILED:'失败',REDEEMED:'已核销',RELEASED:'已释放',RETURNED:'已返还',NONE:'未触发',EXPIRED_NOT_RETURNED:'已过期不返券'};
  function displayStatus(c,t=now()){return c.status==='AVAILABLE'?(ms(t)>=ms(c.validTo)?'EXPIRED':ms(t)<ms(c.validFrom)?'PENDING':'AVAILABLE'):c.status;}
  const methodLabels={MANUAL:'人工发放',SYSTEM:'接口发放'};
  function templateState(c){return c.status;}
  function templateStatus(c){return {ENABLED:'已上架',PAUSED:'已下架'}[c.status]||c.status;}
  function batchState(c,t=now()){return c.status!=='DRAFT'&&ms(t)>=ms(c.issueTo)?'CLOSED':c.status==='ENABLED'&&ms(t)<ms(c.issueFrom)?'SCHEDULED':c.status;}
  function log(db,action,objectId,before,after,reason='',t=now(),extra={}) {db.couponData.events.unshift({id:id('LOG'),action,objectId,before,after,reason,time:t,operator:['优惠券过期','订单锁券','支付核销','关单释放','全额退款返券判定'].includes(action)?'交易系统（演示）':'演示运营',...extra});}
  function templateIssue(db,d) {
    if(!d.name?.trim())return '请输入模板名称';
    if(d.name.trim().length>40)return '模板名称最多 40 个字';
    if(d.currency!=='CNY')return '当前商品价格支持人民币券';
    if(!int(d.face)||!d.face)return '券面额必须大于 0，最多两位小数';
    if(!int(d.threshold))return '使用门槛须为非负金额';
    if(!['ALL','SKU'].includes(d.scope))return '请选择适用范围';
    if(d.scope==='SKU'&&(!d.skuIds?.length||d.skuIds.some(x=>!Model.get(db,'products',x))))return '请至少选择一个有效商品';
    if(d.scope==='SKU'&&new Set(d.skuIds).size!==d.skuIds.length)return '适用商品不能重复';
    if(!Array.isArray(d.allowedMethods)||!d.allowedMethods.length||d.allowedMethods.some(m=>!methodLabels[m]))return '请至少选择一种允许发放方式';
    return '';
  }
  function rule(db,templateId){const t=get(db,'templates',templateId);return {name:t.name,currency:t.currency,face:t.face,threshold:t.threshold,scope:t.scope,bearer:'PLATFORM',skuIds:db.couponData.scopes.filter(s=>s.templateId===t.id).map(s=>s.skuId)};}
  function saveTemplate(db,d,templateId='',t=now()) {
    const error=templateIssue(db,d);assert(!error,error);const old=templateId?get(db,'templates',templateId):null;
    assert(!templateId||old,'券模板不存在');assert(!old?.deletedAt,'模板已删除，不能编辑');
    const fields={name:d.name.trim(),currency:d.currency,face:d.face,threshold:d.threshold,scope:d.scope,allowedMethods:[...new Set(d.allowedMethods)]};
    const row=old?Object.assign(old,fields,{updatedAt:t,revision:(old.revision||1)+1}):{id:id('TPL'),...fields,status:'ENABLED',bearer:'PLATFORM',ruleType:'FIXED_AMOUNT',revision:1,deletedAt:null,createdAt:t,updatedAt:t,publishedAt:t};
    if(!old)db.couponData.templates.unshift(row);
    db.couponData.scopes=db.couponData.scopes.filter(s=>s.templateId!==row.id);
    if(d.scope==='SKU')db.couponData.scopes.push(...d.skuIds.map(skuId=>({id:id('SCOPE'),templateId:row.id,skuId})));
    log(db,old?'编辑券模板':'创建券模板',row.id,old?row.status:'',row.status,'编辑仅影响后续新建计划；已有计划按保存的规则执行',t);return row;
  }
  function setTemplateStatus(db,templateId,status,t=now()) {
    const row=get(db,'templates',templateId);assert(row&&!row.deletedAt,'券模板不存在或已删除');
    assert(['ENABLED','PAUSED'].includes(status),'模板状态无效');if(row.status===status)return row;
    assert(({ENABLED:['PAUSED'],PAUSED:['ENABLED']})[row.status]?.includes(status),'当前状态不支持此操作');
    if(status==='ENABLED'){const error=templateIssue(db,{...row,skuIds:rule(db,row.id).skuIds});assert(!error,error);}
    const before=row.status;row.status=status;row.updatedAt=t;if(status==='ENABLED')row.publishedAt||=t;
    log(db,status==='ENABLED'?'上架模板':'下架模板',row.id,before,status,'仅控制新建计划；已有计划和已发券继续按保存的规则执行',t);return row;
  }
  function deleteTemplate(db,templateId,t=now()){
    const row=get(db,'templates',templateId);assert(row&&!row.deletedAt,'券模板不存在或已删除');
    const before=row.status;row.deletedAt=t;row.status='PAUSED';row.updatedAt=t;
    log(db,'删除模板',row.id,before,'已删除','从模板列表移除，不允许新建计划；已有计划及已发券不受影响',t);return row;
  }
  function batchIssue(db,d,existing=false){
    const tpl=get(db,'templates',d.templateId);if(!tpl)return '请选择优惠券模板';
    if(!d.name?.trim()||d.name.trim().length>60)return '请填写 1–60 字计划名称';
    if(!methodLabels[d.method]||!(existing?(d.ruleSnapshot?.allowedMethods||[d.method]):tpl.allowedMethods).includes(d.method))return '发放方式不在模板允许范围内';
    if(d.limit!==null&&(!int(d.limit)||d.limit<1))return '计划发放总量须为正整数，或留空表示不限';
    if(!int(d.userLimit)||d.userLimit<1)return '每人本计划发放上限须为正整数';
    if(d.limit!==null&&d.userLimit>d.limit)return '每人上限不能超过计划总量';
    if([d.validFrom,d.validTo,d.issueFrom,d.issueTo].some(v=>!Number.isFinite(ms(v))))return '请完整填写有效期和发放时间';
    if(ms(d.validFrom)>=ms(d.validTo))return '有效期结束时间须晚于开始时间';
    if(ms(d.issueFrom)>=ms(d.issueTo))return '发放结束时间须晚于开始时间';
    if(ms(d.issueTo)>ms(d.validTo))return '发放结束时间不能晚于券有效期结束时间';
    return '';
  }
  function saveBatch(db,d,batchId='',t=now()){
    const old=batchId?get(db,'batches',batchId):null;assert(!batchId||old,'发放计划不存在');assert(!old||old.status==='DRAFT','已开启计划配置不可编辑，请新建计划');
    const same=old&&old.templateId===d.templateId,tpl=get(db,'templates',d.templateId);
    if(!same)assert(tpl&&tpl.status==='ENABLED'&&!tpl.deletedAt,'请选择已上架且未删除的模板');
    const snapshot=same?old.ruleSnapshot:{...rule(db,d.templateId),allowedMethods:[...tpl.allowedMethods],templateRevision:tpl.revision||1};
    const error=batchIssue(db,{...d,ruleSnapshot:snapshot},true);assert(!error,error);
    const fields={name:d.name.trim(),templateId:d.templateId,method:d.method,limit:d.limit,userLimit:d.userLimit,validFrom:d.validFrom,validTo:d.validTo,issueFrom:d.issueFrom,issueTo:d.issueTo,ruleSnapshot:copy(snapshot)};
    const row=old?Object.assign(old,fields,{updatedAt:t}):{id:id('BATCH'),...fields,status:'DRAFT',issued:0,createdAt:t,updatedAt:t,publishedAt:null};
    if(!old)db.couponData.batches.unshift(row);log(db,old?'编辑发放计划':'创建发放计划',row.id,old?'DRAFT':'',row.status,'券规则按创建计划时保存，后续模板变更不影响本计划',t);return row;
  }
  function setBatchStatus(db,batchId,status,t=now()){
    const b=get(db,'batches',batchId);assert(b,'发放计划不存在');assert(({DRAFT:['ENABLED'],ENABLED:['PAUSED','CLOSED'],PAUSED:['ENABLED','CLOSED'],CLOSED:[]})[b.status]?.includes(status),'当前计划状态不支持此操作');
    if(status==='ENABLED'){assert(ms(t)<ms(b.issueTo),'本计划发放时间已结束，请新建计划');const error=batchIssue(db,b,true);assert(!error,error);assert(b.ruleSnapshot,'计划缺少券规则');b.publishedAt||=t;}
    const before=b.status;b.status=status;b.updatedAt=t;log(db,status==='ENABLED'?'开启/恢复计划':status==='PAUSED'?'暂停计划':'结束计划',b.id,before,status,'只影响本计划后续发放；已发券继续可用',t);return b;
  }
  function grantable(batch,method,t){assert(batch,'发放计划不存在');assert(batch.method===method,'本计划不允许此发放方式');assert(batch.status==='ENABLED','本计划未开启发放');assert(ms(t)>=ms(batch.issueFrom)&&ms(t)<ms(batch.issueTo),'不在本计划允许发放时间内');}
  function executeItem(db,task,item,t) {
    if(item.status==='SUCCESS')return item;const batch=get(db,'batches',task.batchId);item.attempts++;
    try {
      grantable(batch,task.source==='BACKOFFICE'?'MANUAL':'SYSTEM',t);
      const user=db.users.find(u=>u['用户UID']===item.targetUid);assert(user,'用户 UID 不存在');item.userId=user.uid;
      const prior=db.couponData.userCoupons.find(c=>c.grantItemId===item.id);if(prior){item.status='SUCCESS';item.couponId=prior.id;item.error='';return item;}
      assert(batch.limit===null||batch.issued<batch.limit,'本计划发放总量已达上限');
      assert(db.couponData.userCoupons.filter(c=>c.batchId===batch.id&&c.userId===user.uid).length<batch.userLimit,'该用户本计划累计发放数量已达上限');
      const coupon={id:id('CARD'),templateId:batch.templateId,batchId:batch.id,userId:user.uid,grantItemId:item.id,status:'AVAILABLE',validFrom:batch.validFrom,validTo:batch.validTo,activeRedemptionId:null,version:0,issuedAt:t,revokedAt:null,revokeReason:''};
      db.couponData.userCoupons.unshift(coupon);batch.issued++;item.status='SUCCESS';item.couponId=coupon.id;item.error='';
      log(db,'发券成功',coupon.id,'','AVAILABLE',task.reason,t,{templateId:batch.templateId,batchId:batch.id,taskId:task.id,userId:user.uid,operator:task.operator});
    }catch(e){item.status='FAILED';item.error=e.message;log(db,'发券失败',item.id,'','FAILED',e.message,t,{batchId:task.batchId,taskId:task.id,operator:task.operator});}
    item.completedAt=t;return item;
  }
  function updateTask(db,task,t){const rows=db.couponData.grantItems.filter(i=>i.taskId===task.id);task.success=rows.filter(r=>r.status==='SUCCESS').length;task.failed=rows.length-task.success;task.status=task.failed?(task.success?'PARTIAL_SUCCESS':'FAILED'):'SUCCESS';task.finishedAt=t;}
  function fingerprint(batchId,targets,reason,source){return JSON.stringify([batchId,targets,reason.trim(),source.source,source.sourceSystem||'',source.sourceRecordId||'',source.activityId||'',source.activityName||'']);}
  function issue(db,batchId,uids,reason,requestKey,t,source){
    const targets=[...new Set(uids.map(x=>x.trim()).filter(Boolean))].sort();assert(targets.length&&targets.length<=200,'每次请输入 1–200 个用户 UID');assert(reason?.trim(),'请填写发放原因');assert(requestKey,'缺少发放请求标识');
    const mark=fingerprint(batchId,targets,reason,source),existing=db.couponData.grantTasks.find(x=>x.requestKey===requestKey);if(existing){assert(existing.fingerprint===mark,'同一请求标识不能提交不同发券参数');return existing;}
    const b=get(db,'batches',batchId);grantable(b,source.source==='BACKOFFICE'?'MANUAL':'SYSTEM',t);
    const task={id:id('TASK'),batchId,templateId:b.templateId,requestKey,fingerprint:mark,reason:reason.trim(),...source,operator:source.source==='BACKOFFICE'?'演示运营':source.sourceSystem,targetCount:targets.length,createdAt:t,status:'RUNNING'};
    db.couponData.grantTasks.unshift(task);for(const uid of targets){const item={id:id('ITEM'),taskId:task.id,targetUid:uid,userId:null,status:'PENDING',attempts:0,couponId:null,error:''};db.couponData.grantItems.push(item);executeItem(db,task,item,t);}updateTask(db,task,t);return task;
  }
  function grant(db,batchId,uids,reason,requestKey,t=now()){assert(!requestKey?.startsWith('SYSTEM:'),'人工请求不能使用接口发放标识');return issue(db,batchId,uids,reason,requestKey,t,{source:'BACKOFFICE'});}
  function grantFromSystem(db,d,t=now()){
    assert(d.sourceSystem?.trim()&&d.sourceRecordId?.trim(),'接口发放须提供来源系统及唯一奖励明细编号');assert(d.userUid?.trim(),'缺少独立站用户 UID');assert(d.activityName?.trim(),'三方活动接口发放须传入活动名称');
    const source={source:'SYSTEM',sourceSystem:d.sourceSystem.trim(),sourceRecordId:d.sourceRecordId.trim(),activityId:d.activityId||'',activityName:d.activityName.trim()};
    return issue(db,d.batchId,[d.userUid],'三方活动接口发放','SYSTEM:'+JSON.stringify([source.sourceSystem,source.sourceRecordId]),t,source);
  }
  function retryGrant(db,taskId,t=now()){const task=get(db,'grantTasks',taskId);assert(task,'发放记录不存在');grantable(get(db,'batches',task.batchId),task.source==='BACKOFFICE'?'MANUAL':'SYSTEM',t);for(const item of db.couponData.grantItems.filter(i=>i.taskId===taskId&&i.status==='FAILED'))executeItem(db,task,item,t);updateTask(db,task,t);return task;}
  function expire(db,t=now()){let count=0;for(const c of db.couponData.userCoupons)if(c.status==='AVAILABLE'&&ms(t)>=ms(c.validTo)){c.status='EXPIRED';c.version++;log(db,'优惠券过期',c.id,'AVAILABLE','EXPIRED','超过有效期',t);count++;}return count;}
  function revoke(db,couponIds,reason,t=now()) {
    assert(reason?.trim(),'请填写回收原因');assert(couponIds.length,'请先选择用户券');
    return [...new Set(couponIds)].map(cid=>{const c=get(db,'userCoupons',cid);const status=c&&displayStatus(c,t);if(!c||!['AVAILABLE','PENDING'].includes(status))return {id:cid,success:false,reason:!c?'用户券不存在':labels[status]+'，不能回收'};
      c.status='REVOKED';c.version++;c.revokedAt=t;c.revokeReason=reason.trim();log(db,'回收优惠券',cid,'AVAILABLE','REVOKED',reason.trim(),t);return {id:cid,success:true,reason:'回收成功'};});
  }
  function quote(db,couponId,ctx,t=now()) {
    const c=get(db,'userCoupons',couponId);assert(c,'用户券不存在');assert(c.userId===ctx.userId,'优惠券不属于当前用户');
    const account=Model.get(db,'users',ctx.userId);assert(account,'用户不存在');
    assert(!db.blacklist.some(b=>b['手机号']===account['手机号']&&(b['权限限制']||[]).some(p=>['拉黑支付','拉黑下单','拉黑登录'].includes(p))),'当前用户存在交易权限限制');
    assert(displayStatus(c,t)==='AVAILABLE','该券'+labels[displayStatus(c,t)]+'，不可使用');
    const tpl=get(db,'batches',c.batchId).ruleSnapshot;assert(tpl.currency===ctx.currency,'订单与优惠券币种不一致');assert(['支付宝扫码','微信扫码'].includes(ctx.payment),'当前支付方式不支持人民币优惠券');
    assert(Array.isArray(ctx.lines)&&ctx.lines.length,'请选择商品');
    const ids=new Set();for(const line of ctx.lines){assert(!ids.has(line.skuId),'商品明细不能重复');ids.add(line.skuId);const p=Model.get(db,'products',line.skuId);assert(p,'商品不存在');assert(p['发售状态']==='已发售','未发售商品不可购买或用券');assert(p['状态']==='上架','商品未上架');assert(Number.isInteger(line.quantity)&&line.quantity>0&&p['库存']>=line.quantity,'商品库存不足或购买数量无效');assert(!p['单次购买上限']||line.quantity<=p['单次购买上限'],'超过商品单次购买上限');assert(int(line.amountMinor)&&line.amountMinor>0,'商品报价无效');}
    const allowed=new Set(tpl.skuIds);
    const eligible=ctx.lines.filter(l=>tpl.scope==='ALL'||allowed.has(l.skuId));
    const base=eligible.reduce((n,l)=>n+l.amountMinor,0),total=ctx.lines.reduce((n,l)=>n+l.amountMinor,0);
    assert(base>0,'商品不在优惠券适用范围内');assert(base>=tpl.threshold,'适用商品折后金额未达到 '+money(tpl.threshold)+' 元门槛');
    const floor=ctx.minPayMinor??1;assert(int(floor)&&floor>=1,'最低实付金额无效');
    const discount=Math.min(tpl.face,base,Math.max(0,total-floor));assert(discount>0,'金额不足以抵扣优惠券');
    const allocations=eligible.map(l=>({skuId:l.skuId,discount:Math.floor(discount*l.amountMinor/base),remainder:discount*l.amountMinor%base})).sort((a,b)=>b.remainder-a.remainder||a.skuId.localeCompare(b.skuId));
    let remaining=discount-allocations.reduce((n,l)=>n+l.discount,0);for(const a of allocations)if(remaining>0){a.discount++;remaining--;}
    return {currency:tpl.currency,base,total,discount,payable:total-discount,allocations,templateId:c.templateId,batchId:c.batchId,ruleSnapshot:{name:tpl.name,face:tpl.face,threshold:tpl.threshold,scope:tpl.scope,bearer:'PLATFORM'}};
  }
  // 此函数只构建原型验券输入，真实项目应使用订单服务返回的最终报价。
  function demoContext(db,userId,skuId,quantity=1,payment='支付宝扫码',t=now()) {
    const p=Model.get(db,'products',skuId);assert(p,'请选择商品');
    let unit=minor(p['人民币售价']),promoNames=[],supplierNames=[];
    const members=p['商品类型']==='组合商品'?(p['选择商品']||[]):[skuId];
    for(const member of members){const binding=db.productSuppliers.filter(b=>b.productId===member&&b['状态']==='启用').sort((a,b)=>a['排序']-b['排序'])[0];assert(binding,'商品尚未绑定有效供货商');supplierNames.push(Model.get(db,'suppliers',binding.supplierId)?.['供货商']||'');
      const active=db.promotions.filter(r=>r.refs?.['关联货源']?.includes(binding.sourceId)&&Model.promotionStatus(r,new Date(t))==='执行中');
      assert(active.length<=1,'该货源存在重叠活动，需确认最终交易报价');
      if(active.length&&p['商品类型']==='组合商品')throw Error('组合商品包含活动货源，需以交易服务最终组合报价验券');
      if(active.length){unit=Math.round(unit*active[0]['折扣']);promoNames.push(active[0]['活动名称']);}}
    return {userId,currency:'CNY',payment,minPayMinor:1,lines:[{skuId,name:p['商品名称'],quantity,amountMinor:unit*quantity}],supplierNames:[...new Set(supplierNames)],promotion:promoNames.join('、')||'无供货商活动',unit};
  }
  function lock(db,couponId,orderId,ctx,deadline,t=now()) {
    const existing=db.couponData.redemptions.find(r=>r.orderId===orderId);if(existing){assert(existing.couponId===couponId,'该订单已使用其他优惠券');return existing;}
    const order=Model.get(db,'orders',orderId);assert(order&&order['支付状态']==='未支付'&&order['订单状态']==='待支付','仅待支付订单可锁券');assert(ms(deadline)>ms(t),'订单支付时限已过');
    const q=quote(db,couponId,ctx,t),c=get(db,'userCoupons',couponId),r={id:id('USE'),couponId,orderId,status:'LOCKED',...q,lines:copy(ctx.lines),supplierNames:ctx.supplierNames||[],promotion:ctx.promotion||'交易报价快照',lockedAt:t,deadline,redeemedAt:null,releasedAt:null,returnedAt:null,returnResult:'NONE'};
    c.status='LOCKED';c.activeRedemptionId=r.id;c.version++;db.couponData.redemptions.unshift(r);
    order.couponRedemptionId=r.id;order['订单金额（元）']=q.total/100;order['实付金额(元)']=0;order.couponDiscountMinor=q.discount;order.payableMinor=q.payable;
    log(db,'订单锁券',c.id,'AVAILABLE','LOCKED','',t,{redemptionId:r.id,orderId});return r;
  }
  function redeem(db,redemptionId,paidMinor,currency,t=now()) {
    const r=get(db,'redemptions',redemptionId);assert(r,'用券记录不存在');assert(paidMinor===r.payable&&currency===r.currency,'支付金额或币种与订单不一致');if(['REDEEMED','RETURNED'].includes(r.status))return r;
    const c=get(db,'userCoupons',r.couponId);assert(r.status==='LOCKED'&&c.activeRedemptionId===r.id&&c.status==='LOCKED','订单已释放或券状态冲突，请处理异常支付');assert(ms(t)<=ms(r.deadline),'已超过订单支付期限，请核对支付结果');
    r.status='REDEEMED';r.redeemedAt=t;c.status='USED';c.version++;
    const o=Model.get(db,'orders',r.orderId);o['支付状态']='已支付';o['订单状态']='支付成功';o['实付金额(元)']=paidMinor/100;
    log(db,'支付核销',c.id,'LOCKED','USED','',t,{redemptionId:r.id,orderId:r.orderId});return r;
  }
  function release(db,redemptionId,confirmedClosed,t=now()) {
    const r=get(db,'redemptions',redemptionId);assert(r,'用券记录不存在');if(r.status==='RELEASED')return r;assert(confirmedClosed===true,'须先确认未支付且支付单已关闭');
    const c=get(db,'userCoupons',r.couponId);assert(r.status==='LOCKED'&&c.activeRedemptionId===r.id,'当前订单不可释放券');
    r.status='RELEASED';r.releasedAt=t;r.releaseReason='确认未支付并关单';c.activeRedemptionId=null;c.status=ms(t)>=ms(c.validTo)?'EXPIRED':'AVAILABLE';c.version++;
    Model.get(db,'orders',r.orderId)['订单状态']='已取消';log(db,'关单释放',c.id,'LOCKED',c.status,r.releaseReason,t,{redemptionId:r.id,orderId:r.orderId});return r;
  }
  function returnAfterRefund(db,redemptionId,eventId,refundedMinor,t=now()) {
    const r=get(db,'redemptions',redemptionId);assert(r,'用券记录不存在');if(r.returnResult!=='NONE')return r;
    assert(eventId&&r.status==='REDEEMED','仅已核销订单退款成功后可判定返券');assert(refundedMinor===r.payable,'尚未全额退款，不返还优惠券');
    const c=get(db,'userCoupons',r.couponId);assert(c.status==='USED'&&c.activeRedemptionId===r.id,'原券关联已变更');
    r.refundEventId=eventId;r.returnedAt=t;Model.get(db,'orders',r.orderId)['订单状态']='已退款';
    if(ms(t)<ms(c.validTo)){r.status='RETURNED';r.returnResult='RETURNED';c.status='AVAILABLE';c.activeRedemptionId=null;c.version++;}else r.returnResult='EXPIRED_NOT_RETURNED';
    log(db,'全额退款返券判定',c.id,'USED',c.status,labels[r.returnResult],t,{redemptionId:r.id,orderId:r.orderId});return r;
  }
  function validate(db){
    const d=db.couponData,errors=[];if(!d)return ['优惠券数据缺失'];
    for(const key of ['templates','batches','scopes','grantTasks','grantItems','userCoupons','redemptions','events']){if(!Array.isArray(d[key]))return ['优惠券集合格式错误：'+key];if(new Set(d[key].map(r=>r.id)).size!==d[key].length||d[key].some(r=>!r.id))errors.push('优惠券记录 ID 缺失或重复：'+key);}
    for(const tpl of d.templates){const message=templateIssue(db,{...tpl,skuIds:rule(db,tpl.id).skuIds});if(message)errors.push(message);if(!['ENABLED','PAUSED'].includes(tpl.status))errors.push('模板状态无效');}
    for(const b of d.batches){const message=batchIssue(db,b,true);if(message)errors.push(message);if(!['DRAFT','ENABLED','PAUSED','CLOSED'].includes(b.status))errors.push('计划状态无效');if(!b.ruleSnapshot)errors.push('计划缺少优惠规则快照');const cards=d.userCoupons.filter(c=>c.batchId===b.id);if(b.issued!==cards.length)errors.push('计划发行数量不一致');if(b.limit!==null&&b.issued>b.limit)errors.push('超出计划总量');const counts={};for(const c of cards)counts[c.userId]=(counts[c.userId]||0)+1;if(Object.values(counts).some(n=>n>b.userLimit))errors.push('超出计划用户发券限额');}
    if(new Set(d.userCoupons.map(c=>c.grantItemId)).size!==d.userCoupons.length)errors.push('同一发放明细重复发行优惠券');
    if(new Set(d.redemptions.map(r=>r.orderId)).size!==d.redemptions.length)errors.push('同一订单使用多张优惠券');
    if(new Set(d.grantTasks.map(r=>r.requestKey)).size!==d.grantTasks.length)errors.push('发券请求标识重复');
    const rewards=d.grantTasks.filter(t=>t.source==='SYSTEM');if(new Set(rewards.map(t=>JSON.stringify([t.sourceSystem,t.sourceRecordId]))).size!==rewards.length)errors.push('同一奖励重复发券');
    if(new Set(d.grantItems.map(r=>r.taskId+'/'+r.targetUid)).size!==d.grantItems.length)errors.push('同次发放用户重复');
    for(const task of d.grantTasks){const b=get(db,'batches',task.batchId),items=d.grantItems.filter(i=>i.taskId===task.id);if(!b||b.templateId!==task.templateId||items.length!==task.targetCount||items.filter(i=>i.status==='SUCCESS').length!==task.success||items.filter(i=>i.status==='FAILED').length!==task.failed)errors.push('发放记录统计或关联异常');if(!['BACKOFFICE','SYSTEM'].includes(task.source)||task.source==='SYSTEM'&&(!task.sourceSystem||!task.sourceRecordId))errors.push('发放来源无效');}
    for(const item of d.grantItems)if(!get(db,'grantTasks',item.taskId)||(item.status==='SUCCESS'&&!d.userCoupons.some(c=>c.id===item.couponId&&c.grantItemId===item.id)))errors.push('发券明细关联异常');
    for(const scope of d.scopes)if(!get(db,'templates',scope.templateId)||!Model.get(db,'products',scope.skuId))errors.push('优惠券范围关联异常');
    for(const c of d.userCoupons){const b=get(db,'batches',c.batchId),item=get(db,'grantItems',c.grantItemId),task=item&&get(db,'grantTasks',item.taskId);if(!b||b.templateId!==c.templateId||task?.batchId!==c.batchId||!Model.get(db,'users',c.userId))errors.push('用户券关联失效');if(!['AVAILABLE','LOCKED','USED','EXPIRED','REVOKED'].includes(c.status))errors.push('用户券状态无效');if(['LOCKED','USED'].includes(c.status)){const r=get(db,'redemptions',c.activeRedemptionId);if(!r||r.couponId!==c.id||r.status!==(c.status==='LOCKED'?'LOCKED':'REDEEMED'))errors.push('用户券与订单状态不一致');}}
    for(const r of d.redemptions){if(!get(db,'userCoupons',r.couponId)||!Model.get(db,'orders',r.orderId))errors.push('用券记录关联失效');if(!int(r.discount)||r.discount>r.total||r.total-r.discount!==r.payable||r.allocations.reduce((n,l)=>n+l.discount,0)!==r.discount)errors.push('订单券金额不一致');}
    return errors;
  }
  function separateLegacy(db,t){
    const d=db.couponData;if(d.batches)return;d.batches=[];
    for(const tpl of d.templates){const b={id:'CP-BATCH-LEGACY-'+tpl.id,templateId:tpl.id,name:tpl.name+' · 原发放配置',method:'MANUAL',status:tpl.status,issued:tpl.issued,limit:tpl.limit,userLimit:tpl.userLimit,issueFrom:tpl.issueFrom,issueTo:tpl.issueTo,validFrom:tpl.validFrom,validTo:tpl.validTo,createdAt:tpl.createdAt,updatedAt:tpl.updatedAt,publishedAt:tpl.publishedAt,ruleSnapshot:tpl.status==='DRAFT'?null:rule(db,tpl.id)};d.batches.push(b);tpl.status=tpl.status==='DRAFT'?'DRAFT':'ENABLED';tpl.allowedMethods=['MANUAL'];for(const key of ['issued','limit','userLimit','issueFrom','issueTo','validFrom','validTo'])delete tpl[key];}
    for(const task of d.grantTasks){task.batchId='CP-BATCH-LEGACY-'+task.templateId;task.source=task.source||'BACKOFFICE';task.fingerprint=fingerprint(task.batchId,d.grantItems.filter(i=>i.taskId===task.id).map(i=>i.targetUid).sort(),task.reason,task);}
    for(const c of d.userCoupons)c.batchId='CP-BATCH-LEGACY-'+c.templateId;
    db.audit.unshift({time:date(t),operator:'原型升级',action:'券模板与发放计划解耦；历史额度、日期及用户券关系保留。'});
  }
  function normalizePlans(db,t){
    const d=db.couponData;if(d.planModelVersion===18)return;
    for(const tpl of d.templates){if(tpl.status==='DRAFT')tpl.status='PAUSED';tpl.revision||=1;tpl.deletedAt??=null;}
    for(const b of d.batches){b.ruleSnapshot||=rule(db,b.templateId);b.ruleSnapshot.allowedMethods||=[...new Set([...(get(db,'templates',b.templateId).allowedMethods||[]),b.method])];b.ruleSnapshot.templateRevision||=1;}
    d.planModelVersion=18;db.audit.unshift({time:date(t),operator:'原型升级',action:'优惠券模板移除草稿，原草稿转为已下架；所有存量计划保存独立券规则，用户券及交易记录保留。'});
  }
  function recipients(db,batchId){
    return db.couponData.userCoupons.filter(c=>c.batchId===batchId).map(c=>{
      const item=get(db,'grantItems',c.grantItemId),task=get(db,'grantTasks',item.taskId),uses=db.couponData.redemptions.filter(r=>r.couponId===c.id),times=uses.filter(r=>r.redeemedAt).map(r=>r.redeemedAt).sort();
      return {coupon:c,uid:Model.get(db,'users',c.userId)?.['用户UID']||c.userId,receivedAt:c.issuedAt,redeemedAt:times.at(-1)||null,redemptionCount:times.length,channel:task.source==='SYSTEM'?'三方活动（接口）':'后台人工发放',sourceSystem:task.sourceSystem||'管理后台',activityName:task.activityName||'',operator:task.operator,sourceRecordId:task.sourceRecordId||'',uses};
    });
  }
  function seedReusable(db,t){
    if(db.couponData.reusableDemo)return;db.couponData.reusableDemo=true;
    const tpl=saveTemplate(db,{name:'满200减10（复用示例）',currency:'CNY',face:1000,threshold:20000,scope:'ALL',skuIds:[],allowedMethods:['MANUAL','SYSTEM']},'',t);setTemplateStatus(db,tpl.id,'ENABLED',t);
    const base={templateId:tpl.id,limit:100,userLimit:2,issueFrom:at(t,-1),issueTo:at(t,7),validFrom:at(t,-1),validTo:at(t,14)};
    const manual=saveBatch(db,{...base,name:'日常运营计划（演示）',method:'MANUAL'},'',t);setBatchStatus(db,manual.id,'ENABLED',t);
    const system=saveBatch(db,{...base,name:'活动奖品计划（演示）',method:'SYSTEM',validTo:at(t,30)},'',t);setBatchStatus(db,system.id,'ENABLED',t);
    const u=db.users.find(u=>u['用户UID']==='U-DEMO-02');if(u){grant(db,manual.id,[u['用户UID']],'复用模板人工发放示例','seed-reusable-manual',t);grantFromSystem(db,{batchId:system.id,userUid:u['用户UID'],sourceSystem:'活动系统（演示）',sourceRecordId:'AWARD-DEMO-001',activityId:'ACTIVITY-DEMO-001',activityName:'转盘活动（演示）'},t);}
  }
  function upgrade(db,t=now()) {
    let parent=db.permissions.find(p=>p['菜单类型']==='一级菜单'&&(p['路径']==='/marketing'||p['权限名称']==='营销管理'));
    if(!parent){parent={uid:'perm-coupon-parent',refs:{'父级菜单':''},'权限名称':'营销管理','菜单类型':'一级菜单','组件':'Layout','路径':'/marketing','状态':'启用'};db.permissions.push(parent);}
    parent['路径']='/marketing';
    const original=db.permissions.find(p=>p['路径']===ROUTES.coupons),oldId=original?.uid;
    const menuIds=Object.entries(COUPON_PAGES).map(([key,p])=>{let menu=db.permissions.find(m=>m['路径']===p.path);if(!menu){menu={uid:key==='coupons'?'perm-coupon-child':'perm-'+key,refs:{'父级菜单':parent.uid},'权限名称':p.name,'菜单类型':'子菜单','组件':key,'路径':p.path,'状态':'启用'};db.permissions.push(menu);}else menu['权限名称']=p.name;return menu.uid;});
    for(const role of db.roles.filter(r=>['管理员','平台运营'].includes(r['角色名称'])||(oldId&&(db.rolePermissions[r.uid]||[]).includes(oldId))))db.rolePermissions[role.uid]=[...new Set([...(db.rolePermissions[role.uid]||[]),parent.uid,...menuIds])];
    for(const retired of db.permissions.filter(p=>['/marketing/couponUses','/marketing/couponWallet'].includes(p['路径']))){retired['状态']='禁用';const plans=db.permissions.find(p=>p['路径']===ROUTES.couponGrants);for(const roleId in db.rolePermissions)if(db.rolePermissions[roleId].includes(retired.uid)&&!db.rolePermissions[roleId].includes(plans.uid))db.rolePermissions[roleId].push(plans.uid);}
    if(db.couponData){separateLegacy(db,t);normalizePlans(db,t);seedReusable(db,t);return;}
    db.couponData={templates:[],batches:[],scopes:[],grantTasks:[],grantItems:[],userCoupons:[],redemptions:[],events:[]};
    const base={allowedMethods:['MANUAL'],method:'MANUAL',currency:'CNY',face:2000,threshold:6000,scope:'ALL',skuIds:[],limit:2000,userLimit:10,validFrom:at(t,-5),validTo:at(t,30),issueFrom:at(t,-7),issueTo:at(t,20)};
    const seedBatch=(d,time)=>{const tpl=saveTemplate(db,d,'',time);setTemplateStatus(db,tpl.id,'ENABLED',time);const b=saveBatch(db,{...d,templateId:tpl.id,name:d.name+' · 首期'},'',time);return b;};
    const common=seedBatch({...base,name:'全场满60减20'},at(t,-6));setBatchStatus(db,common.id,'ENABLED',at(t,-6));
    const gameProducts=db.products.filter(p=>p['商品名称'].includes('黑神话'));
    const special=seedBatch({...base,name:'游戏精选满200减30',face:3000,threshold:20000,scope:gameProducts.length?'SKU':'ALL',skuIds:gameProducts.map(p=>p.uid),limit:500,userLimit:1},at(t,-6));setBatchStatus(db,special.id,'ENABLED',at(t,-6));
    saveTemplate(db,{...base,name:'新用户10元券',face:1000,threshold:0,userLimit:1},'',t);
    const paused=seedBatch({...base,name:'周末满100减15',face:1500,threshold:10000},at(t,-6));setBatchStatus(db,paused.id,'ENABLED',at(t,-6));setBatchStatus(db,paused.id,'PAUSED',t);
    const expired=seedBatch({...base,name:'往期满60减10',face:1000,issueFrom:at(t,-15),issueTo:at(t,-2),validFrom:at(t,-15),validTo:at(t,-1)},at(t,-15));setBatchStatus(db,expired.id,'ENABLED',at(t,-14));
    const users=db.users.slice(0,2);if(users.length){grant(db,common.id,users.map(u=>u['用户UID']),'日常运营发放（演示）','seed-common',t);grant(db,special.id,[users[0]['用户UID'],'U-DEMO-NOT-EXIST'],'定向发放（演示）','seed-special',t);grant(db,expired.id,[users[0]['用户UID']],'历史活动发放（演示）','seed-expired',at(t,-3));}
    setBatchStatus(db,expired.id,'CLOSED',t);
    const user=users[1]||users[0],p=db.products.find(p=>p['状态']==='上架'&&p['发售状态']==='已发售'&&p['商品类型']==='独立商品'&&p['人民币售价']>=60&&p['库存']>0),baseOrder=db.orders[0];
    if(user&&p&&baseOrder)for(const [i,kind] of ['REDEEMED','LOCKED','RETURNED','EXPIRED_NOT_RETURNED','REVOKED'].entries()){
      const historical=kind==='EXPIRED_NOT_RETURNED',template=historical?expired:common,issueTime=at(t,historical?-3:-0.1);
      if(historical)template.status='ENABLED';const task=grant(db,template.id,[user['用户UID']],'优惠券流程样例（演示）','seed-'+kind,issueTime);if(historical)template.status='CLOSED';
      const item=db.couponData.grantItems.find(it=>it.taskId===task.id),c=get(db,'userCoupons',item.couponId);if(!c)continue;
      if(kind==='REVOKED'){revoke(db,[c.id],'活动误发回收（演示）',t);continue;}
      let ctx;try{ctx=demoContext(db,user.uid,p.uid,1,'支付宝扫码',issueTime);}catch{continue;}
      const oid='CP-ORDER-DEMO-'+(i+1),order={...copy(baseOrder),uid:oid,'订单编号':oid,'第三方商户订单号':'CP-MERCHANT-DEMO-'+(i+1),'第三方单号':'CP-THIRD-DEMO-'+(i+1),'商品名称':p['商品名称'],'买家手机号':user['手机号'],'订单状态':'待支付','支付状态':'未支付','支付方式':'支付宝扫码','下单时间':date(issueTime),'手续费(元)':0,'是否提取':'否',couponDemo:true};db.orders.unshift(order);
      const r=lock(db,c.id,oid,ctx,kind==='LOCKED'?at(t,1/48):at(issueTime,1/48),issueTime);
      if(kind!=='LOCKED')redeem(db,r.id,r.payable,'CNY',issueTime);
      if(['RETURNED','EXPIRED_NOT_RETURNED'].includes(kind)){
        returnAfterRefund(db,r.id,'CP-REFUND-DEMO-'+i,r.payable,t);
        const refund={...(db.refunds[0]?copy(db.refunds[0]):{refs:{}}),uid:'CP-REFUND-DEMO-'+i,'退款编号':'CP-REFUND-DEMO-'+i,'订单编号':oid,'第三方商户订单号':'CP-MERCHANT-DEMO-'+(i+1),'第三方单号':'CP-THIRD-DEMO-'+(i+1),'商品名称':p['商品名称'],'买家手机号':user['手机号'],'退款金额':r.payable/100,'退款类型':'全部退款','退款状态':'退款成功','退款原因':'优惠券退款流程演示','创建时间':date(t),'退款时间':date(t)};db.refunds.unshift(refund);
      }
    }
    expire(db,t);normalizePlans(db,t);seedReusable(db,t);
    db.audit.unshift({time:date(t),operator:'原型升级',action:'新增营销管理 / 优惠券及独立演示记录；存量商品、订单记录保留。'});
  }
  return {labels,methodLabels,get,now,at,money,date,minor,displayStatus,templateState,templateStatus,templateIssue,saveTemplate,setTemplateStatus,deleteTemplate,recipients,batchState,batchIssue,saveBatch,setBatchStatus,grantFromSystem,grant,retryGrant,expire,revoke,quote,demoContext,lock,redeem,release,returnAfterRefund,validate,upgrade};
})();
