/* 营销管理 / 优惠券。沿用后台弹窗、表格和下拉控件。 */
const CouponUI = (() => {
  const C=Coupons,tabs={templates:'优惠券模板',batches:'发放计划'};
  let tab='',query={},cpPage=1,cpSize=10,selected=new Set(),afterNavigation=null;
  let routeToken='';
  function templateUrl(id){const hash=ROUTES.couponGrants+(id?'?'+new URLSearchParams({templateId:id}):'');history.replaceState(null,'','#'+hash);routeToken='batches:'+location.hash;}
  function go(view,after){const key=Object.keys(COUPON_PAGES).find(k=>COUPON_PAGES[k].view===view);query={};routeToken='';cpPage=1;selected.clear();if(current===key){render();after?.();}else{afterNavigation=after;navigate(key);}}
  const h=esc,by=(key,id)=>C.get(db,key,id),template=id=>by('templates',id),batch=id=>by('batches',id),user=id=>Model.get(db,'users',id),userName=id=>user(id)?.['用户UID']||'—';
  const button=(label,action,id='',extra='')=>`<button type="button" class="link-btn" data-cp="${action}" data-id="${h(id)}" ${extra}>${h(label)}</button>`;
  const pill=status=>`<span class="badge ${['AVAILABLE','ENABLED','SUCCESS','REDEEMED','RETURNED'].includes(status)?'good':['LOCKED','PAUSED','PARTIAL_SUCCESS','PENDING'].includes(status)?'warn':status==='FAILED'?'bad':''}">${h(C.labels[status]||status)}</span>`;
  const local=t=>t?C.date(t).replace(' ','T').slice(0,16):'';
  const summary=t=>t.threshold?`满 ${C.money(t.threshold)} 减 ${C.money(t.face)}`:`无门槛减 ${C.money(t.face)}`;
  const sel=(name,opts,value='',multiple=false)=>`<select aria-label="${h(({status:'状态',skuIds:'适用商品',method:'发放方式',batchId:'发放计划',templateId:'优惠券模板'})[name]||name)}" name="${h(name)}" ${multiple?'multiple':''}>${multiple?'':'<option value="">全部</option>'}${opts.map(([v,l])=>`<option value="${h(v)}" ${(multiple?value.includes(v):value===v)?'selected':''}>${h(l)}</option>`).join('')}</select>`;
  const field=(name,control,help='',required=false,wide=false)=>`<div class="field ${wide?'span2':''}"><span class="${required?'required':''}">${h(name)}</span>${control}${help?`<div class="field-help">${h(help)}</div>`:''}</div>`;
  const input=(name,value='',type='text',attrs='')=>`<input aria-label="${h(({issueFrom:'开始发放时间',issueTo:'结束发放时间',validFrom:'券生效时间',validTo:'券失效时间',validDays:'有效天数',name:'模板名称',face:'券面额（元）',threshold:'使用门槛（元）',limit:'计划发放总量（张）',userLimit:'每人本计划发放上限（张）',quantity:'数量',keyword:'名称或编号',user:'用户 UID',order:'订单编号'})[name]||name)}" name="${h(name)}" type="${type}" value="${h(value)}" ${attrs}>`;
  const table=(headers,rows)=>`<div class="table-wrap"><table class="coupon-table"><thead><tr>${headers.map(x=>`<th class="${x==='操作'?'actions-cell':''}">${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(cells=>`<tr>${cells.map((x,i)=>`<td class="${headers[i]==='操作'?'actions-cell':''}">${x}</td>`).join('')}</tr>`).join(''):`<tr><td class="empty" colspan="${headers.length}">暂无符合条件的数据</td></tr>`}</tbody></table></div>`;
  const dl=rows=>`<dl class="detail-grid coupon-details">${rows.map(([label,value])=>`<div><dt>${h(label)}</dt><dd>${h(value??'—')}</dd></div>`).join('')}</dl>`;
  function run(action,fn,done){let result;if(commit(action,()=>{result=fn();})){done?.(result);return true;}return false;}
  function error(form,message){const box=form.querySelector('[data-cp-error]');box.textContent=message;box.hidden=false;box.scrollIntoView({block:'nearest'});}
  const templatePill=t=>`<span class="badge ${t.status==='ENABLED'?'good':t.status==='PAUSED'?'warn':''}">${h(C.templateStatus(t))}</span>`;
  const sourceOf=c=>by('grantTasks',by('grantItems',c.grantItemId)?.taskId);
  let recipientState=null;
  function records(){
    return (tab==='templates'?db.couponData.templates.filter(t=>!t.deletedAt):db.couponData.batches).filter(r=>{
      const text=[r.id,r.name,r.ruleSnapshot?.name,template(r.templateId)?.name].join(' ').toLowerCase(),status=tab==='templates'?r.status:C.batchState(r);
      return (!query.keyword||text.includes(query.keyword.toLowerCase()))&&(!query.status||status===query.status)&&(!query.method||r.method===query.method)&&(!query.templateId||r.templateId===query.templateId);
    });
  }
  function render(){
    const pageInfo=COUPON_PAGES[current];if(!pageInfo)return;if(tab!==pageInfo.view){tab=pageInfo.view;query={};cpPage=1;selected.clear();}
    const token=tab+':'+location.hash;if(routeToken!==token){query={};if(tab==='batches')query.templateId=new URLSearchParams(location.hash.split('?')[1]||'').get('templateId')||'';routeToken=token;cpPage=1;}
    const d=db.couponData,all=records(),pages=Math.max(1,Math.ceil(all.length/cpSize));cpPage=Math.max(1,Math.min(cpPage,pages));const rows=all.slice((cpPage-1)*cpSize,cpPage*cpSize);
    const states=tab==='templates'?[['ENABLED','已上架'],['PAUSED','已下架']]:['DRAFT','ENABLED','CLOSED'].map(v=>[v,C.labels[v]]);
    const filtersHtml=`<form id="couponFilters" class="panel"><div class="filters">${field(tab==='templates'?'模板名称 / 编号':'计划 / 模板',input('keyword',query.keyword||'','text','placeholder="请输入"'))}${tab==='batches'?field('优惠券模板',sel('templateId',d.templates.map(t=>[t.id,t.name+' · '+t.id+(t.deletedAt?'（已删除）':'')]),query.templateId||''))+field('发放方式',sel('method',Object.entries(C.methodLabels),query.method||'')):''}${field('状态',sel('status',states,query.status||''))}</div><div class="filter-actions"><button type="submit" class="btn primary">查询</button><button type="button" class="btn" data-cp="reset">重置</button></div></form>`;
    let headers,cells;
    if(tab==='templates'){
      headers=['优惠券名称','优惠券 ID','优惠规则','适用范围','关联发放计划数','模板状态','操作'];
      cells=rows.map(t=>[`<strong>${h(t.name)}</strong>`,`<span class="coupon-number">${h(t.id)}</span>`,h(summary(t)),t.scope==='ALL'?'全部商品':`指定 ${d.scopes.filter(x=>x.templateId===t.id).length} 个商品`,button(String(d.batches.filter(b=>b.templateId===t.id).length),'relatedPlans',t.id),templatePill(t),`<div class="coupon-actions">${button('详情','templateDetail',t.id)}${button('编辑','editTemplate',t.id)}${t.status==='ENABLED'?button('新建发放','planFromTemplate',t.id):''}${button(t.status==='ENABLED'?'下架':'上架',t.status==='ENABLED'?'disableTemplate':'enableTemplate',t.id)}${button('删除','deleteTemplate',t.id)}</div>`]);
    }else{
      headers=['计划名称','计划 ID','优惠券模板','发放方式','发放人群','开启时间','券有效期','已发 / 总量','计划状态','操作'];
      cells=rows.map(b=>[`<strong>${h(b.name)}</strong>`,`<span class="coupon-number">${h(b.id)}</span>`,button(b.ruleSnapshot?.name||template(b.templateId)?.name,'planRule',b.id),h(C.methodLabels[b.method]),h(C.audienceText(b)),h(C.date(b.publishedAt)),`<span class="coupon-wrap coupon-date">${h(C.validityText(b))}</span>`,`${b.issued} / ${b.limit??'不限'}`,pill(C.batchState(b)),`<div class="coupon-actions">${button('发放详情','batchDetail',b.id)}${b.status==='DRAFT'?button('编辑','editBatch',b.id)+button('开启','openBatch',b.id):''}${C.batchState(b)!=='CLOSED'?button('结束','endBatch',b.id):''}</div>`]);
    }
    const actions=tab==='templates'?'<button class="btn primary" data-cp="newTemplate">＋ 新建模板</button>':'<button class="btn primary" data-cp="newBatch">＋ 新建发放计划</button>';
    $('#content').innerHTML=`<div class="page-head"><div><h1>${h(pageInfo.name)}</h1><p>${h(pageInfo.desc)}</p></div>${actions}</div>${filtersHtml}<section class="panel"><div class="panel-title"><h3>${tabs[tab]}</h3><span class="muted">共 ${all.length} 条</span></div>${table(headers,cells)}<div class="pagination"><button class="btn small" data-cp="prev" ${cpPage===1?'disabled':''}>上一页</button><span>${cpPage} / ${pages}</span><button class="btn small" data-cp="next" ${cpPage===pages?'disabled':''}>下一页</button><select aria-label="优惠券每页条数" id="cpPageSize">${[10,20,50].map(n=>`<option value="${n}" ${n===cpSize?'selected':''}>${n} 条/页</option>`).join('')}</select></div></section>`;
    SelectControls.refresh($('#content'));const done=afterNavigation;afterNavigation=null;done?.();
  }
  function showTemplate(templateId='',readOnly=false,snapshot=null){
    const old=templateId?template(templateId):null,d=snapshot?{...snapshot}:old?{...old}:{name:'',face:2000,threshold:6000,scope:'ALL'};
    const skus=snapshot?snapshot.skuIds:old?db.couponData.scopes.filter(x=>x.templateId===old.id).map(x=>x.skuId):[];
    const body=`<form id="cpTemplateForm" class="form-grid" novalidate><div class="error-msg span2" data-cp-error hidden role="alert"></div>${field('模板名称',input('name',d.name,'text','maxlength="40" placeholder="请输入模板名称"'),'',true)}${field('券类型','<input value="固定金额券" readonly aria-label="券类型">','使用门槛为 0 时，即为无门槛券。')}${field('券面额（元）',input('face',C.money(d.face),'number','min="0.01" step="0.01"'),'',true)}${field('使用门槛（元）',input('threshold',C.money(d.threshold),'number','min="0" step="0.01"'),'按适用商品的活动折后金额判断门槛。',true)}${field('适用范围',`<select name="scope" aria-label="适用范围"><option value="ALL" ${d.scope==='ALL'?'selected':''}>全部商品</option><option value="SKU" ${d.scope==='SKU'?'selected':''}>指定商品</option></select>`,'',true)}<div class="field span2" id="cpScopeField" ${d.scope==='ALL'?'hidden':''}><span class="required">适用商品</span>${sel('skuIds',db.products.map(x=>[x.uid,x['商品名称']+' · '+x['商品ID']]),skus,true)}</div><div class="notice span2">模板保存后即可用于新建发放计划。后续编辑、下架或删除仅影响新计划，已有计划和已发券继续按创建计划时的规则执行。</div></form>`;
    const mid=modal(snapshot?'计划券规则':readOnly?'优惠券模板详情':templateId?'编辑优惠券模板':'新建优惠券模板',body,readOnly?'<button class="btn" data-action="close">关闭</button>':'<button class="btn" data-action="close">取消</button><button class="btn primary" type="submit" form="cpTemplateForm">保存</button>',true);
    const form=$('#cpTemplateForm');
    form.elements.scope.onchange=()=>{const show=form.elements.scope.value==='SKU';$('#cpScopeField').hidden=!show;form.elements.skuIds.disabled=!show;SelectControls.refresh(form);};form.elements.scope.onchange();
    if(readOnly){form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);form.classList.add('coupon-readonly');SelectControls.refresh(form);return;}
    form.onsubmit=e=>{e.preventDefault();try{const fd=new FormData(form),data=Object.fromEntries(fd),payload={name:data.name,currency:'CNY',face:C.minor(data.face),threshold:C.minor(data.threshold),scope:data.scope,skuIds:[...form.elements.skuIds.selectedOptions].map(o=>o.value)};if(!run('保存优惠券模板',()=>C.saveTemplate(db,payload,templateId),()=>{closeModal(mid);go('templates',()=>toast('模板已保存；已有计划和已发券不受影响'));}))error(form,lastCommitError);}catch(err){error(form,err.message);}};SelectControls.refresh(form);
  }
  function templateDetail(id){showTemplate(id,true);}
  function showBatch(batchId='',templateId=''){
    const old=batchId?batch(batchId):null,d=old?{...old}:{name:'',templateId,method:'MANUAL',limit:1000,userLimit:1,validityType:'FIXED',validFrom:C.now(),validTo:C.at(C.now(),30),validDays:7,audienceType:'ALL',audienceUids:[],audienceFileName:'',timingType:'IMMEDIATE',issueTo:''};
    const choices=db.couponData.templates.filter(t=>t.status==='ENABLED'&&!t.deletedAt);
    if(batchId&&!choices.some(t=>t.id===d.templateId))choices.unshift({...template(d.templateId),name:d.ruleSnapshot.name+'（原计划保留）'});
    const radios=(name,options,value)=>`<div class="coupon-radio-row">${options.map(([v,l,disabled])=>`<label class="coupon-radio ${disabled?'disabled':''}"><input type="radio" name="${name}" aria-label="${l}" value="${v}" ${v===value?'checked':''} ${disabled?'disabled':''}><span>${l}</span></label>`).join('')}</div>`;
    const body=`<form id="cpBatchForm" class="form-grid" novalidate>
      <div class="error-msg span2" data-cp-error hidden role="alert"></div>
      ${field('计划名称','<input name="batchName" aria-label="计划名称" maxlength="60" placeholder="如：10月运营发券" value="'+h(d.name)+'">','',true)}
      ${field('优惠券模板',`<select name="templateId" aria-label="优惠券模板"><option value="">请选择已上架模板</option>${choices.map(t=>`<option value="${h(t.id)}" ${t.id===d.templateId?'selected':''}>${h(t.name)} · ${h(summary(t))}</option>`).join('')}</select>`,'',true)}
      <div class="notice span2" id="cpBatchRule">请选择模板查看优惠规则。</div>
      ${field('发放方式',`<select name="method" aria-label="发放方式">${Object.entries(C.methodLabels).map(([v,l])=>`<option value="${v}" ${v===d.method?'selected':''}>${l}</option>`).join('')}</select>`,'人工发放直接到账；接口发放由三方活动触发，不代表用户主动领取。',true)}
      ${field('发放人群',radios('audienceType',[['ALL','全部用户'],['UIDS','指定人群']],d.audienceType),'',true)}
      <div class="field span2" id="cpAudienceField"><span class="required">导入用户 UID</span><div class="coupon-upload"><a class="btn small" href="assets/templates/coupon-audience-template.xlsx" download="优惠券指定人群导入模板.xlsx">下载 Excel 模板</a><input name="audienceFile" type="file" aria-label="上传指定人群 Excel" accept=".xlsx"></div><div class="field-help">仅支持 .xlsx；首列为 UID，从第 2 行起每行填写一个，建议使用文本格式。重复 UID 自动去重。原型单次最多 10,000 行，文件不超过 5 MB。</div><div class="coupon-import-result" id="cpImportResult" aria-live="polite"></div></div>
      ${field('发放时间',radios('timingType',[['IMMEDIATE','立即发放'],['SCHEDULED','定时发放（暂不支持）',true]],'IMMEDIATE'),'创建后立即生效。',true,true)}
      <div class="field span2" id="cpTimingHelp"><div class="field-help"></div></div>
      ${field('计划发放总量（张）',input('limit',d.limit??'','number','min="1" step="1" placeholder="留空表示不限"'),'回收、过期不返还发行额度。')}
      <div class="field" id="cpUserLimit"><span class="required">每人本计划发放上限（张）</span>${input('userLimit',d.userLimit,'number','min="1" step="1"')}<div class="field-help">仅在本计划累计；其他计划独立计数。</div></div>
      ${field('券有效期',radios('validityType',[['FIXED','固定日期'],['AFTER_RECEIPT','领取后有效']],d.validityType),'',true,true)}
      <div class="field span2" id="cpFixedDates"><span class="required">有效日期</span><div class="coupon-date-inputs">${input('validFrom',local(d.validFrom),'datetime-local')}<span>至</span>${input('validTo',local(d.validTo),'datetime-local')}</div></div>
      <div class="field span2" id="cpRelativeDays"><span class="required">有效天数</span><div class="coupon-days">领取后 ${input('validDays',d.validDays||7,'number','min="1" step="1"')} 天内有效</div><div class="field-help">从实际到账时间起算，1 天为 24 小时。例：10月1日 10:00 领取，7 天后于10月8日 10:00 失效。</div></div>
      <div class="field span2" id="cpIssueEnd"><span>发放截止时间</span>${input('issueTo',local(d.issueTo),'datetime-local')}<div class="field-help">选填。留空时，固定日期券在有效期结束时停止发放；领取后有效券持续至手动结束计划。结束计划不缩短已发券有效期。</div></div>
      <div class="notice span2">计划开启后配置固定；结束后仅供查看，不能重新开启。模板后续编辑、下架或删除不影响本计划。</div>
    </form>`;
    const mid=modal(batchId?'编辑发放计划':'新建发放计划',body,'<button class="btn" data-action="close">取消</button><button class="btn primary" type="submit" form="cpBatchForm">创建</button>',true),form=$('#cpBatchForm');
    let importedUids=[...(d.audienceUids||[])],importedFile=d.audienceFileName||'',uploadVersion=0,uploading=false;
    $('#cpImportResult').textContent=d.audienceType==='UIDS'&&importedUids.length?`已导入 ${importedUids.length} 个 UID（${importedFile||'历史指定人群'}）`:'尚未导入 UID';
    const update=()=>{
      const manual=form.elements.method.value==='MANUAL',relative=form.elements.validityType.value==='AFTER_RECEIPT',pack=form.elements.audienceType.value==='UIDS';
      $('#cpAudienceField').hidden=!pack;form.elements.audienceFile.disabled=!pack;
      $('#cpFixedDates').hidden=relative;form.elements.validFrom.disabled=relative;form.elements.validTo.disabled=relative;
      $('#cpRelativeDays').hidden=!relative;form.elements.validDays.disabled=!relative;
      $('#cpIssueEnd').hidden=manual;form.elements.issueTo.disabled=manual;
      $('#cpUserLimit').hidden=manual;form.elements.userLimit.disabled=manual;
      $('#cpTimingHelp .field-help').textContent=manual?'创建后立即向所选人群每人发放 1 张，全部用户按创建时名单确定；执行完成后计划自动结束并归档。':'创建后立即接收接口请求；仅所选人群可获券。三方需传用户 UID、活动名称、来源系统及唯一奖励明细编号。';
      SelectControls.refresh(form);
    };
    form.elements.templateId.onchange=()=>{
      const t=template(form.elements.templateId.value),saved=batchId&&d.templateId===form.elements.templateId.value?d.ruleSnapshot:null;
      $('#cpBatchRule').textContent=t?summary(saved||t)+'；'+((saved||t).scope==='ALL'?'全部商品':'指定商品')+'。规则随计划保存，后续模板变更不影响本计划。':'请选择模板查看优惠规则。';update();
    };
    form.addEventListener('change',e=>{if(['method','audienceType','validityType'].includes(e.target.name))update();});form.elements.templateId.onchange();
    form.elements.audienceFile.onchange=async()=>{
      const file=form.elements.audienceFile.files[0],ticket=++uploadVersion,box=$('#cpImportResult'),submit=$('#'+mid+' .modal-foot button[type=submit]');
      importedUids=[];importedFile='';uploading=false;box.classList.remove('bad');
      if(!file){box.textContent='尚未导入 UID';submit.disabled=false;return;}
      uploading=true;submit.disabled=true;box.textContent='正在读取并校验 UID…';
      try{
        if(!/\.xlsx$/i.test(file.name))throw Error('仅支持 .xlsx Excel 文件');
        if(file.size>CouponAudience.maxBytes)throw Error('Excel 文件不能超过 5 MB');
        const parsed=CouponAudience.parse(await file.arrayBuffer());
        if(ticket!==uploadVersion||!form.isConnected)return;
        const issue=C.audienceIssue(db,parsed.uids);if(issue)throw Error(issue);
        importedUids=parsed.uids;importedFile=file.name;box.textContent=`${file.name}：已导入 ${parsed.uids.length} 个有效 UID`+(parsed.duplicates?`，已去除 ${parsed.duplicates} 条重复记录`:'');
      }catch(err){if(ticket===uploadVersion&&form.isConnected){box.classList.add('bad');box.textContent='导入失败：'+err.message;}}
      finally{if(ticket===uploadVersion&&form.isConnected){uploading=false;submit.disabled=false;}}
    };
    form.onsubmit=e=>{e.preventDefault();try{
      if(uploading)throw Error('请等待 Excel 校验完成');
      const data=Object.fromEntries(new FormData(form)),time=C.now(),payload={name:data.batchName,templateId:data.templateId,method:data.method,limit:data.limit===''?null:Number(data.limit),userLimit:data.method==='MANUAL'?1:Number(data.userLimit),audienceType:data.audienceType,audienceUids:data.audienceType==='UIDS'?importedUids:[],audienceFileName:data.audienceType==='UIDS'?importedFile:'',timingType:data.timingType,validityType:data.validityType,validDays:data.validityType==='AFTER_RECEIPT'?Number(data.validDays):null,issueFrom:time};
      for(const k of ['issueTo','validFrom','validTo'])payload[k]=data[k]?new Date(data[k]).toISOString():null;
      if(payload.validityType==='FIXED'&&!payload.issueTo)payload.issueTo=payload.validTo;
      if(!run('创建发放计划',()=>{const b=C.saveBatch(db,payload,batchId,time);C.activatePlan(db,b.id,time);return b;},b=>{closeModal(mid);if(current==='couponGrants')templateUrl('');go('batches',()=>toast(b.method==='MANUAL'?'已向 '+b.issued+' 位用户发券，计划已归档':'接口发放计划已创建并开启'));}))error(form,lastCommitError);
    }catch(err){error(form,err.message==='Invalid time value'?'请完整填写有效日期时间':err.message);}};
  }
  function batchDetail(id){
    const b=batch(id),t=b.ruleSnapshot||template(b.templateId);recipientState={id,keyword:'',status:'',page:1};
    modal('发放详情',dl([['计划名称',b.name],['计划编号',b.id],['优惠券模板',t.name],['优惠规则',summary(t)],['发放方式',C.methodLabels[b.method]],['发放人群',C.audienceText(b)],['发放时间类型','立即发放'],['计划状态',C.labels[C.batchState(b)]],['已发 / 总量',b.issued+' / '+(b.limit??'不限')],['每人本计划上限',b.userLimit+' 张'],['开启时间',C.date(b.publishedAt)],['发放截止时间',b.issueTo?C.date(b.issueTo):'手动结束计划'],['结束时间',C.date(b.endedAt||(C.batchState(b)==='CLOSED'?b.issueTo:null))],['券有效期',C.validityText(b)]])+'<div id="cpPlanRecipients"></div>','<button class="btn" data-action="close">关闭</button>',true);refreshRecipients();
  }
  function refreshRecipients(){
    const root=$('#cpPlanRecipients');if(!root||!recipientState)return;const q=recipientState;
    const all=C.recipients(db,q.id).filter(r=>(!q.status||C.displayStatus(r.coupon)===q.status)&&(!q.keyword||[r.uid,r.nickname,r.coupon.id,r.channel,r.sourceSystem,r.activityName].join(' ').toLowerCase().includes(q.keyword.toLowerCase()))).sort((a,b)=>Date.parse(b.receivedAt)-Date.parse(a.receivedAt));
    const size=10,pages=Math.max(1,Math.ceil(all.length/size));q.page=Math.min(q.page,pages);const rows=all.slice((q.page-1)*size,q.page*size);
    root.innerHTML='<h3 class="section-title">用户获券明细</h3><p class="field-help">每张已到账的券一条记录。“券使用状态”表示当前是否可用、已核销、已过期等，与发放计划状态无关。领取时间为实际到账时间；退款返券后不重置有效期。</p>'+`<form id="cpRecipientFilters" class="coupon-recipient-filters"><input name="keyword" aria-label="发放用户搜索" value="${h(q.keyword)}" placeholder="用户 UID、昵称、券编号或活动名称">${sel('status',['AVAILABLE','PENDING','LOCKED','USED','EXPIRED','REVOKED'].map(v=>[v,C.labels[v]]),q.status).replace('aria-label="状态"','aria-label="券使用状态"').replace('>全部</option>','>全部券使用状态</option>')}<button class="btn primary" type="submit">查询</button><button class="btn" type="button" id="cpRecipientReset">重置</button></form><div class="coupon-recipient-tools">共 ${all.length} 张券</div>`+table(['用户 UID','用户昵称','获券来源','领取时间','有效期','券使用状态','最近核销时间','用户券编号'],rows.map(r=>{const c=r.coupon;return [h(r.uid),h(r.nickname),`<strong>${h(r.channel)}</strong><small class="coupon-source">${h(r.channel==='活动奖励'?'活动：'+(r.activityName||'历史记录未提供名称'):'操作人：'+r.operator)}</small>`,`<span class="coupon-date">${h(C.date(r.receivedAt))}</span>`,`<span class="coupon-date">${h(C.date(c.validFrom))}<br>至 ${h(C.date(c.validTo))}</span>`,pill(C.displayStatus(c)),h(C.date(r.redeemedAt)),`<span class="coupon-number">${h(c.id)}</span>`];}))+`<div class="pagination"><button type="button" class="btn small" id="cpRecipientPrev" ${q.page===1?'disabled':''}>上一页</button><span>${q.page} / ${pages}</span><button type="button" class="btn small" id="cpRecipientNext" ${q.page===pages?'disabled':''}>下一页</button></div>`;
    SelectControls.refresh(root);
    $('#cpRecipientFilters').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);q.keyword=f.get('keyword').trim();q.status=f.get('status');q.page=1;refreshRecipients();};
    $('#cpRecipientReset').onclick=()=>{q.keyword='';q.status='';q.page=1;refreshRecipients();};
    $('#cpRecipientPrev').onclick=()=>{q.page--;refreshRecipients();};$('#cpRecipientNext').onclick=()=>{q.page++;refreshRecipients();};
  }
  function pricingHtml(r){return `<div class="coupon-price-grid">${[['商品折后金额','¥ '+C.money(r.total)],['优惠券抵扣','− ¥ '+C.money(r.discount)],['券后应付','¥ '+C.money(r.payable)]].map(([l,v])=>`<div><small>${l}</small><strong>${v}</strong></div>`).join('')}</div>`+dl([['券名称',r.ruleSnapshot.name],['供货商活动',r.promotion],['优惠承担方','平台'],['供货商结算','沿用原结算规则'],['适用商品门槛金额','¥ '+C.money(r.base)],['优惠规则',`满 ${C.money(r.ruleSnapshot.threshold)} 减 ${C.money(r.ruleSnapshot.face)}`]])+'<h3 class="section-title">商品金额快照</h3>'+table(['商品','数量','折后金额','券优惠分摊','券后金额'],r.lines.map(l=>{const discount=r.allocations.find(a=>a.skuId===l.skuId)?.discount||0;return [h(l.name||Model.get(db,'products',l.skuId)?.['商品名称']||l.skuId),l.quantity,'¥ '+C.money(l.amountMinor),'¥ '+C.money(discount),'¥ '+C.money(l.amountMinor-discount)];}));}
  document.addEventListener('submit',e=>{if(e.target.id==='couponFilters'){e.preventDefault();query=Object.fromEntries(new FormData(e.target));if(tab==='batches')templateUrl(query.templateId||'');cpPage=1;selected.clear();render();}});
  document.addEventListener('change',e=>{if(e.target.id==='cpPageSize'){cpSize=Number(e.target.value);cpPage=1;render();}});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-cp]');if(!b||b.disabled)return;const action=b.dataset.cp,id=b.dataset.id;
    if(action==='relatedPlans')return navigate('couponGrants',{templateId:id});
    if(action==='reset'){if(tab==='batches')templateUrl('');query={};cpPage=1;selected.clear();return render();}if(['prev','next'].includes(action)){cpPage+=action==='prev'?-1:1;selected.clear();return render();}
    if(action==='newBatch')return showBatch();if(action==='editBatch')return showBatch(id);if(action==='batchDetail')return batchDetail(id);
    if(action==='newTemplate')return showTemplate();if(action==='editTemplate')return showTemplate(id);if(action==='planFromTemplate')return showBatch('',id);if(action==='planRule')return showTemplate(batch(id).templateId,true,batch(id).ruleSnapshot);if(action==='templateDetail')return templateDetail(id);
    if(['disableTemplate','enableTemplate'].includes(action)){const state=action==='disableTemplate'?'PAUSED':'ENABLED',name=state==='PAUSED'?'下架模板':'上架模板';return confirmAction(name,'仅影响后续新建计划；已有计划和已发券继续按保存的规则执行。',()=>run(name,()=>C.setTemplateStatus(db,id,state),()=>{render();toast('模板状态已更新');}));}
    if(action==='deleteTemplate')return confirmAction('删除模板','删除后模板从列表移除，不能用于新建计划。已有计划继续发券，已发券和订单记录保留。确认删除？',()=>run('删除优惠券模板',()=>C.deleteTemplate(db,id),()=>{render();toast('模板已删除；已有计划和已发券不受影响');}));
    if(['openBatch','endBatch'].includes(action)){
      const open=action==='openBatch',name=open?'开启计划':'结束计划',b=batch(id);
      const message=open?(b.method==='MANUAL'?'立即向「'+C.audienceText(b)+'」每人发放 1 张，完成后自动结束并归档。':'立即开启接口发放；所选人群可通过三方活动获取优惠券。'):'结束后仅供查看，不能重新开启；已发券仍按原有效期使用。';
      return confirmAction(name,message,()=>run(name,()=>open?C.activatePlan(db,id):C.setBatchStatus(db,id,'CLOSED'),()=>{render();toast(open&&b.method==='MANUAL'?'已完成发券，计划已归档':'计划状态已更新');}));
    }
  });
  const baseDetails=details;details=function(key,row){baseDetails(key,row);const order=key==='orders'?row:key==='refunds'?db.orders.find(o=>o['订单编号']===row['订单编号']):null;if(!order?.couponRedemptionId)return;const r=by('redemptions',order.couponRedemptionId);if(!r)return;const root=$$('.overlay').at(-1);root.querySelector('.modal-body').insertAdjacentHTML('beforeend','<h3 class="section-title">优惠券信息</h3>'+pricingHtml(r)+dl([['用券状态',C.labels[r.status]],['退款返券',C.labels[r.returnResult]],['用户券编号',r.couponId]]));};
  setInterval(()=>{if(db.couponData.userCoupons.some(c=>c.status==='AVAILABLE'&&Date.now()>=Date.parse(c.validTo)))run('优惠券到期处理',()=>C.expire(db),()=>{if(COUPON_PAGES[current]){render();refreshRecipients();}});},30000);
  return {render};
})();
if(COUPON_PAGES[current])render();
