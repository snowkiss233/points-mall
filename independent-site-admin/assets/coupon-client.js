/* V1.2.4 用户侧交互原型。仅保存本地虚构数据，不调用支付或雷神接口。 */
(()=>{
  const dataKey='nn-independent-admin-v1',orderKey='yoplay-v124-demo-orders',phoneKey='yoplay-v124-demo-phone-bindings',C=Coupons,$=id=>document.getElementById(id);
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'¥ '+Number(n).toFixed(2),mask=phone=>String(phone||'').replace(/^(\d{3})\d+(\d{4})$/,'$1****$2');
  let userUid=sessionStorage.getItem('yoplay-client-user')||'',pendingSku='',pendingCode='',currentSku='',currentOrder='';
  const read=()=>{const raw=localStorage.getItem(dataKey);return Model.prepare(raw?JSON.parse(raw):makeSeed());};
  const save=d=>{const errors=Model.validate(d);if(errors.length)throw Error(errors.slice(0,3).join('；'));localStorage.setItem(dataKey,JSON.stringify(d));};
  const orders=()=>{try{return JSON.parse(localStorage.getItem(orderKey)||'[]');}catch{return [];}};
  const saveOrders=list=>localStorage.setItem(orderKey,JSON.stringify(list));
  const phoneBindings=()=>{try{return JSON.parse(localStorage.getItem(phoneKey)||'{}');}catch{return {};}};
  const boundPhone=(d,uid)=>{const bindings=phoneBindings();if(Object.hasOwn(bindings,uid))return bindings[uid];if(uid==='U-DEMO-01')return '13800138000';if(uid==='U-DEMO-02')return '';const value=String(d.users.find(u=>u['用户UID']===uid)?.['手机号']||'');return /^1\d{10}$/.test(value)?value:'';};
  const orderStatus=o=>o.type!=='RECHARGE'?'待提取':o.status==='WAIT_BINDING'?'待绑定手机号':o.status==='SUCCESS'?'充值已到账':'充值中';
  function startRecharge(list,o,phone){if(o.status!=='WAIT_BINDING')return false;o.phone=phone;o.status='PROCESSING';o.supplierRequestId='DEMO-REQ-'+o.id;o.rechargeSubmittedAt=new Date().toISOString();saveOrders(list);return true;}
  const close=id=>{if($(id).open)$(id).close();};
  const user=d=>d.users.find(u=>u['用户UID']===userUid);
  const product=(d,id)=>d.products.find(p=>p.uid===id);
  const isRecharge=p=>p?.['账号类型']==='接口充值';
  function initialize(){
    const d=read();
    if(!d.couponData.passphraseDemo){
      const plans={};
      for(const [code,discount] of [['YOPLAY8',true],['WELCOME10',false]]){
        const t=C.now(),tpl=C.saveTemplate(d,{name:discount?'渠道专享 8 折券':'新人满60减10',currency:'CNY',ruleType:discount?'DISCOUNT':'FIXED_AMOUNT',discountTenths:80,face:1000,threshold:discount?0:6000,scope:'ALL',skuIds:[]});
        const b=C.saveBatch(d,{name:code+' · 口令奖励演示',templateId:tpl.id,method:'SYSTEM',limit:1000,userLimit:null,audienceType:'ALL',validityType:'AFTER_RECEIPT',validDurationSeconds:7*86400,issueFrom:t,issueTo:C.at(t,365),triggerScenes:['HOME']});
        C.activatePlan(d,b.id,t);plans[code]=b.id;
      }
      d.couponData.passphraseDemo=plans;
    }
    save(d);return d;
  }
  function offer(d,p){
    const plan=C.eventPlan(d,p.uid);if(!plan)return null;
    const current=user(d),card=current&&d.couponData.userCoupons.filter(c=>c.batchId===plan.id&&c.userId===current.uid).sort((a,b)=>Date.parse(b.issuedAt)-Date.parse(a.issuedAt))[0];
    if(card&&Date.now()<Date.parse(card.validTo)&&C.displayStatus(card)!=='AVAILABLE')return null;
    if(current&&card&&(plan.repeatPolicy||'CYCLE')==='ONCE'&&Date.now()>=Date.parse(card.validTo))return null;
    if(current&&!card&&!C.matchesAudience(d,plan,current))return null;
    if(current&&card&&Date.now()>=Date.parse(card.validTo)&&!C.matchesAudience(d,plan,current))return null;
    if(!card&&plan.limit!==null&&plan.issued>=plan.limit)return null;
    if(card&&Date.now()>=Date.parse(card.validTo)&&plan.limit!==null&&plan.issued>=plan.limit)return null;
    let base;try{base=C.demoContext(d,current?.uid||d.users[0]?.uid,p.uid).unit;}catch{return null;}
    const rule=plan.ruleSnapshot;
    if(base<rule.threshold)return null;
    const discount=Math.min(rule.ruleType==='DISCOUNT'?Math.floor(base*(100-rule.discountTenths)/100):rule.face,base-1);
    if(discount<=0)return null;
    return {plan,card,discount,basePrice:base/100,price:(base-discount)/100,conditional:!current&&plan.audienceType!=='ALL'};
  }
  function drawProducts(d,term=''){
    const rows=d.products.filter(p=>p['状态']==='上架'&&p['发售状态']==='已发售'&&(!term||p['商品名称'].toLowerCase().includes(term.toLowerCase())));
    $('products').innerHTML=rows.length?rows.map(p=>{const promo=offer(d,p),recharge=isRecharge(p);return `<article class="card ${recharge?'recharge':''}"><div class="art"></div><div class="grow"><span class="pill">${recharge?'接口充值 · 雷神加速器':'数字商品'}</span><h3>${h(p['商品名称'])}</h3><p>${h(p['商品子标题']||p['商品规格']||'')}</p></div><div>${promo?`<span class="price">${money(promo.price)}</span><span class="old">${money(promo.basePrice)}</span><div class="promo">${promo.card?'已领券价':promo.conditional?'符合条件可享券后价':'可领券后价'} · ${promo.conditional?'登录后核验资格':'进入商详自动发券'}</div>`:`<span class="price">${money(p['人民币售价'])}</span><div class="promo">${recharge?'支付后充值至确认的雷神账号':'即时交付数字商品'}</div>`}</div><button class="primary" data-detail="${h(p.uid)}">查看商品详情</button></article>`;}).join(''):'<div class="empty">没有找到相关商品</div>';
  }
  function drawCouponFloat(d){
    const current=user(d),cards=current?d.couponData.userCoupons.filter(c=>c.userId===current.uid&&C.displayStatus(c)==='AVAILABLE').sort((a,b)=>Date.parse(a.validTo)-Date.parse(b.validTo)):[];
    $('couponFloatCount').textContent=cards.length+' 张';
    $('couponFloatList').innerHTML=!current?'<div class="coupon-float-empty">登录后查看可用优惠券</div>':cards.length?cards.map(c=>{
      const rule=C.get(d,'batches',c.batchId)?.ruleSnapshot||C.get(d,'templates',c.templateId)||{};
      const value=rule.ruleType==='DISCOUNT'?(rule.discountTenths||0)/10+'折':C.money(rule.face||0)+'元';
      const condition=rule.threshold?'满 ¥'+C.money(rule.threshold)+' 可用':'无门槛可用';
      return `<div class="coupon-float-card"><div class="coupon-float-value">${h(value)}<small>${rule.ruleType==='DISCOUNT'?'折扣券':'满减券'}</small></div><div class="coupon-float-copy"><strong>${h(rule.name||'优惠券')}</strong><span>${h(condition)} · ${rule.scope==='SKU'?'指定商品':'全部商品'}</span></div><button class="coupon-float-use" type="button" data-coupon-use="${h(c.id)}">去使用</button></div>`;
    }).join(''):'<div class="coupon-float-empty">暂无可用优惠券</div>';
  }
  function useCoupon(couponId){
    const d=read(),current=user(d),card=d.couponData.userCoupons.find(c=>c.id===couponId&&c.userId===current?.uid&&C.displayStatus(c)==='AVAILABLE');
    if(!card){drawCouponFloat(d);$('message').textContent='这张优惠券当前不可使用，请刷新后重试';return;}
    const rule=C.get(d,'batches',card.batchId)?.ruleSnapshot||{};
    if(rule.useDestination==='CUSTOM'&&rule.usePath){
      const path=rule.usePath.trim();
      if(!/^(?:\/(?!\/)|\.\/|#\/)[^\s]*$/.test(path)){$('message').textContent='该券的页面路径无效，请联系运营处理';return;}
      const target=new URL(path,location.href);
      if(target.origin!==location.origin){$('message').textContent='该券的页面路径无效，请联系运营处理';return;}
      location.assign(target.href);return;
    }
    $('couponFloatPanel').hidden=true;$('couponFloatToggle').setAttribute('aria-expanded','false');$('keyword').value='';drawProducts(d);$('search').scrollIntoView({behavior:'smooth',block:'start'});$('keyword').focus();
    $('message').textContent='已进入商品搜索页，可查找适用商品';
  }
  function openDetail(skuId){
    const d=read(),p=product(d,skuId);if(!p)return;
    if(!user(d)){pendingSku=skuId;$('loginDialog').showModal();return;}
    currentSku=skuId;let result=null,error='';
    if(C.eventPlan(d,skuId))try{result=C.grantOnProductDetail(d,skuId,userUid);if(result.issued)save(d);}catch(e){error=e.message;}
    const promo=offer(d,p),recharge=isRecharge(p),benefit=Model.benefitSpec(d,p.uid)?.spec,card=result?.coupon,oneTime=(result?.batch?.repeatPolicy||'CYCLE')==='ONCE';
    const status=card&&Date.now()<Date.parse(card.validTo)?C.displayStatus(card):'';
    const couponNote=error?error==='当前账号不在此优惠券的发放人群内'?`<div class="notice">当前账号不符合此券的领取条件，请按商品当前价格购买。</div>`:`<div class="notice">优惠券暂未到账：${h(error)}。请按当前价格查看，稍后重试。</div>`:result?.issued?`<div class="notice">优惠券已到账，有效期至 ${h(C.date(card.validTo))}。${oneTime?'本计划仅允许领取一次。':'有效期内再次进入不会重复发放。'}</div>`:status==='AVAILABLE'?`<div class="notice">优惠券已领取，有效期至 ${h(C.date(card.validTo))}。${oneTime?'本计划不会再次发放。':''}</div>`:card?oneTime?`<div class="notice">本计划仅允许领取一次，当前账号已领取过，不会再次发放。</div>`:`<div class="notice">本轮优惠券已领取并使用；到期后再次满足触发条件可领取下一轮。</div>`:'';
    $('detailContent').innerHTML=`<span class="eyebrow">${recharge?'雷神加速器 · 接口充值':'游戏数字商品'}</span><h2>${h(p['商品名称'])}</h2><p>${h(p['商品子标题']||'')}</p><div class="summary"><div class="row"><span>商品折后价</span><strong>${money(promo?.basePrice??p['人民币售价'])}</strong></div>${promo?`<div class="row"><span>${promo.card?'已领券价':'可领券后价'}</span><strong>${money(promo.price)}</strong></div>`:''}${recharge?`<div class="row"><span>时长类型</span><strong>${h(benefit?.durationType||'')}</strong></div><div class="row"><span>充值时长</span><strong>${h(benefit?.durationHours||0)} 小时</strong></div><div class="row"><span>交付方式</span><strong>充值到已绑定手机号对应的雷神账号</strong></div>`:''}</div>${couponNote}${recharge?`<p>支付后向当前账号已绑定的手机号充值。${boundPhone(d,userUid)?'请核对绑定手机号；支付成功不代表充值已到账。':'当前账号未绑定手机号，支付后需先绑定并验证，才会提交充值。'}</p>`:'<p>订单支付后按商品交付方式查看履约结果。</p>'}<span class="note">此页为原型，价格及发券演示不代表生产交易报价。</span>`;
    $('buyButton').textContent='立即购买';
    $('detailDialog').showModal();drawProducts(d,$('keyword').value.trim());drawCouponFloat(d);
  }
  function openConfirm(){
    const d=read(),p=product(d,currentSku);if(!p)return;
    close('detailDialog');$('confirmError').textContent='';
    const phone=boundPhone(d,userUid),benefit=Model.benefitSpec(d,p.uid)?.spec;
    $('confirmContent').innerHTML=`<h2>${isRecharge(p)?'确认购买加速器时长':'确认购买商品'}</h2><div class="summary"><div class="row"><span>商品</span><strong>${h(p['商品名称'])}</strong></div><div class="row"><span>演示金额</span><strong>${money(offer(d,p)?.price??p['人民币售价'])}</strong></div>${isRecharge(p)?`<div class="row"><span>时长类型</span><strong>${h(benefit?.durationType||'')}</strong></div><div class="row"><span>加速时长</span><strong>${h(benefit?.durationHours||0)} 小时</strong></div>`:''}</div>${isRecharge(p)?`<div class="notice ${phone?'':'warning'}">${phone?`支付后将充值到当前账号已绑定手机号 ${h(mask(phone))} 对应的雷神账号。支付成功后请查看充值进度。`:'当前账号未绑定手机号。可以先完成支付，但订单将处于“待绑定手机号”；绑定并验证后才向该手机号对应的雷神账号提交充值。'}</div><label class="check"><input id="confirmPhone" type="checkbox"> 我已知晓加速器时长将充值到本账号绑定手机号对应的雷神账号</label>`:'<div class="notice">演示支付完成后显示原卡密商品流程，不生成真实卡密。</div>'}`;
    $('confirmDialog').showModal();
  }
  function completePayment(){
    const d=read(),p=product(d,currentSku);if(!p||!user(d))return;
    const phone=isRecharge(p)?boundPhone(d,userUid):'',benefit=isRecharge(p)?Model.benefitSpec(d,p.uid):null;if(isRecharge(p)){
      if(!$('confirmPhone').checked){$('confirmError').textContent='请先确认充值对象规则';return;}
      if(!Model.resolveProductSupplier(d,p.uid,1)){$('confirmError').textContent='该接口充值商品当前不可供货';return;}
    }
    const order={id:'DEMO-'+Date.now(),userUid,skuId:p.uid,productName:p['商品名称'],type:isRecharge(p)?'RECHARGE':'CDK',phone,status:isRecharge(p)?phone?'PROCESSING':'WAIT_BINDING':'READY',benefitType:benefit?.benefitType||null,durationType:benefit?.spec?.durationType||null,durationHours:benefit?.spec?.durationHours||null,amount:offer(d,p)?.price??p['人民币售价'],createdAt:new Date().toISOString(),supplierRequestId:null,rechargeSubmittedAt:null};
    if(isRecharge(p)&&phone){order.supplierRequestId='DEMO-REQ-'+order.id;order.rechargeSubmittedAt=order.createdAt;}
    saveOrders([order,...orders()]);currentOrder=order.id;close('confirmDialog');
    $('paymentContent').innerHTML=isRecharge(p)?`<h2>支付成功</h2><p>订单 ${h(order.id)}</p><div class="notice ${phone?'':'warning'}">${phone?`正在为已绑定手机号 ${h(mask(phone))} 对应的雷神账号充值 ${h(order.durationHours)} 小时，到账结果以订单详情为准。`:'当前账号尚未绑定手机号，充值请求尚未提交。请先绑定手机号；加速器时长将充值到该手机号对应的雷神账号。'}</div><p>支付成功不代表充值已到账。</p>`:`<h2>支付成功</h2><p>订单 ${h(order.id)}</p><div class="notice">数字商品交付演示。请前往订单详情查看提取入口。</div>`;
    $('paymentOrderButton').textContent=isRecharge(p)?phone?'查看充值进度':'绑定手机号并充值':'提取卡密';$('paymentDialog').showModal();
  }
  function showOrders(){
    if(!user(read())){$('loginDialog').showModal();return;}
    const list=orders().filter(o=>o.userUid===userUid);
    $('ordersContent').innerHTML=list.length?`<div class="orderlist">${list.map(o=>`<button class="orderlink" data-order="${h(o.id)}"><span>${h(o.productName)}<br><small>${h(o.id)}</small></span><span class="pill ${['PROCESSING','WAIT_BINDING'].includes(o.status)?'wait':''}">${h(orderStatus(o))}</span></button>`).join('')}</div>`:'<div class="empty">暂无演示订单</div>';
    $('ordersDialog').showModal();
  }
  function showOrder(id){
    const o=orders().find(x=>x.id===id&&x.userUid===userUid);if(!o)return;currentOrder=id;close('paymentDialog');close('ordersDialog');
    const recharge=o.type==='RECHARGE',waiting=o.status==='WAIT_BINDING';$('orderContent').innerHTML=`<h2>订单详情</h2><div class="summary"><div class="row"><span>订单编号</span><strong>${h(o.id)}</strong></div><div class="row"><span>支付状态</span><strong>支付成功</strong></div><div class="row"><span>履约状态</span><strong>${h(recharge?orderStatus(o):'待提取卡密')}</strong></div><div class="row"><span>商品</span><strong>${h(o.productName)}</strong></div><div class="row"><span>商品合计</span><strong>${money(o.amount)}</strong></div></div>${recharge?`<h3>加速时长充值</h3><div class="row"><span>充值对象</span><strong>${waiting?'待绑定手机号':h(mask(o.phone))}</strong></div><div class="row"><span>时长类型</span><strong>${h(o.durationType||'—')}</strong></div><div class="row"><span>充值时长</span><strong>${h(o.durationHours)} 小时</strong></div>${waiting?'':`<div class="row"><span>供应商业务号</span><strong>${h(o.supplierRequestId)}</strong></div>`}<div class="notice ${waiting?'warning':o.status==='SUCCESS'?'success':''}">${waiting?'请先绑定并验证手机号。完成后才会向该手机号对应的雷神账号提交充值。':o.status==='SUCCESS'?'演示到账成功：加速器时长已发放至上述手机号对应的雷神账号。':'充值结果待确认。若接口超时，应按原业务号查询，不可重复提交充值。'}</div>`:'<h3>激活码</h3><div class="notice">本原型未生成卡密。原 CDK 商品仍使用“提取卡密”入口。</div>'}`;
    $('completeOrder').hidden=!recharge||o.status==='SUCCESS';$('completeOrder').textContent=waiting?'绑定手机号并充值':'演示确认到账';$('orderDialog').showModal();
  }
  function showBind(){
    const o=orders().find(x=>x.id===currentOrder&&x.userUid===userUid&&x.type==='RECHARGE'&&x.status==='WAIT_BINDING');if(!o)return showOrder(currentOrder);
    close('paymentDialog');close('orderDialog');$('bindPhone').value='';$('bindCode').value='';$('bindError').textContent='';$('bindDialog').showModal();
  }
  function confirmBind(){
    const phone=$('bindPhone').value.trim(),code=$('bindCode').value.trim(),d=read();
    if(!/^1\d{10}$/.test(phone)){$('bindError').textContent='请输入有效的 11 位手机号';return;}
    if(code!=='123456'){$('bindError').textContent='请输入演示验证码 123456';return;}
    if(d.users.some(u=>u['用户UID']!==userUid&&boundPhone(d,u['用户UID'])===phone)){$('bindError').textContent='该手机号已绑定其他演示账号';return;}
    const bindings=phoneBindings();bindings[userUid]=phone;localStorage.setItem(phoneKey,JSON.stringify(bindings));
    const list=orders();for(const o of list)if(o.userUid===userUid&&o.type==='RECHARGE'&&o.status==='WAIT_BINDING')startRecharge(list,o,phone);
    close('bindDialog');showOrder(currentOrder);
  }
  function receive(code){
    try{const d=read();if(!user(d)){pendingCode=code;$('loginDialog').showModal();return;}
      const request={batchId:d.couponData.passphraseDemo[code],userUid,sourceSystem:'渠道口令场景（演示）',sourceRecordId:JSON.stringify([code,userUid]),businessType:'PASSPHRASE',businessName:code+' 口令奖励'};
      const existing=d.couponData.grantTasks.find(t=>t.sourceSystem===request.sourceSystem&&t.sourceRecordId===request.sourceRecordId);if(existing?.success){$('message').textContent='该口令奖励已领取';return;}
      const task=C.grantFromSystem(d,request);save(d);drawCouponFloat(d);if(!task.success)throw Error(d.couponData.grantItems.find(i=>i.taskId===task.id)?.error||'领取失败');
      const item=d.couponData.grantItems.find(i=>i.taskId===task.id),card=C.get(d,'userCoupons',item.couponId),rule=C.get(d,'batches',card.batchId).ruleSnapshot;
      $('rewardValue').textContent=rule.ruleType==='DISCOUNT'?rule.discountTenths/10+' 折':money(rule.face/100);$('rewardName').textContent=rule.name;$('rewardValidity').textContent=C.date(card.validFrom)+' 至 '+C.date(card.validTo);$('reward').showModal();
    }catch(e){$('message').textContent=e.message;}
  }
  $('search').onsubmit=e=>{e.preventDefault();const term=$('keyword').value.trim(),code=term.toUpperCase(),d=read();$('message').textContent='';if(code==='EXPIRED'){$('message').textContent='口令已过期';return;}if(d.couponData.passphraseDemo?.[code])receive(code);else if(/^(YOPLAY|WELCOME)/.test(code))$('message').textContent='口令无效，请核对后重试';else drawProducts(d,term);};
  $('products').onclick=e=>{const button=e.target.closest('[data-detail]');if(button)openDetail(button.dataset.detail);};
  $('loginButton').onclick=()=>$('loginDialog').showModal();$('cancelLogin').onclick=()=>{pendingSku='';pendingCode='';close('loginDialog');};
  $('confirmLogin').onclick=()=>{userUid=$('account').value;sessionStorage.setItem('yoplay-client-user',userUid);$('loginButton').textContent=userUid;close('loginDialog');const d=read();drawProducts(d,$('keyword').value.trim());drawCouponFloat(d);if(pendingSku){const sku=pendingSku;pendingSku='';openDetail(sku);}else if(pendingCode){const code=pendingCode;pendingCode='';receive(code);}};
  $('couponFloatToggle').onclick=()=>{const panel=$('couponFloatPanel'),opening=panel.hidden;panel.hidden=!opening;$('couponFloatToggle').setAttribute('aria-expanded',String(opening));if(opening)drawCouponFloat(read());};
  $('couponFloatList').onclick=e=>{const button=e.target.closest('[data-coupon-use]');if(button)useCoupon(button.dataset.couponUse);};
  $('closeDetail').onclick=()=>close('detailDialog');$('buyButton').onclick=openConfirm;$('closeConfirm').onclick=()=>close('confirmDialog');$('payButton').onclick=completePayment;
  $('closePayment').onclick=()=>close('paymentDialog');$('paymentOrderButton').onclick=()=>orders().find(o=>o.id===currentOrder)?.status==='WAIT_BINDING'?showBind():showOrder(currentOrder);$('ordersButton').onclick=showOrders;$('closeOrders').onclick=()=>close('ordersDialog');
  $('ordersContent').onclick=e=>{const button=e.target.closest('[data-order]');if(button)showOrder(button.dataset.order);};$('closeOrder').onclick=()=>close('orderDialog');
  $('completeOrder').onclick=()=>{const list=orders(),o=list.find(x=>x.id===currentOrder&&x.type==='RECHARGE');if(!o)return;if(o.status==='WAIT_BINDING')return showBind();if(o.status==='PROCESSING'){o.status='SUCCESS';saveOrders(list);close('orderDialog');showOrder(o.id);}};
  $('cancelBind').onclick=()=>{close('bindDialog');showOrder(currentOrder);};$('confirmBind').onclick=confirmBind;$('closeReward').onclick=()=>close('reward');
  try{const d=initialize();$('account').innerHTML=d.users.map(u=>`<option value="${h(u['用户UID'])}">${h(u['用户昵称']||u['用户UID'])}${u['用户UID']==='U-DEMO-01'?' · 已绑定演示':u['用户UID']==='U-DEMO-02'?' · 未绑定演示':''}</option>`).join('');if(userUid)$('loginButton').textContent=userUid;drawProducts(d);drawCouponFloat(d);}catch(e){$('message').textContent='演示数据加载失败：'+e.message;}
})();
