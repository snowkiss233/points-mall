/* 只读交互演示：所有号码、验证码及短信记录均为虚构，不连接短信服务。 */
ROUTES.smsQuery='/user/smsVerification';
GROUPS.find(g=>g[0]==='用户管理')[1].push('smsQuery');
SCHEMA.smsQuery={name:'短信验证码查询',filters:[],fields:[],actions:[]};
const SmsQuery=(()=>{
 const now=Date.now(), scenes=['登录','注册','绑定手机号','找回密码'];
 const rows=Array.from({length:24},(_,i)=>({id:'SMS-DEMO-'+String(i+1).padStart(3,'0'),phone:'+86 1990000'+String(i).padStart(4,'0'),scene:scenes[i%4],sent:now-i*90000,expires:now-i*90000+300000,delivery:i%7===3?'发送失败':i%7===4?'发送中':'发送成功',verified:i%6===2?now-i*90000+20000:null,invalid:i%8===5,code:String(610000+i),reason:i%7===3?'供应商返回发送失败（演示）':'—'}));
 let criteria={},page=1,tab='records';const audits=[];
 const stamp=t=>new Date(t).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'});
 const day=()=>stamp(Date.now()).slice(0,10);
 const defaults=()=>({start:day(),end:day(),phone:'',request:'',scene:'',delivery:'',status:''});
 criteria=defaults();
 const status=(r,t=Date.now())=>r.delivery==='发送失败'?'未生成':r.invalid?'已失效':r.verified?'已验证':t>=r.expires?'已过期':'未验证';
 function search(f){
  if(!f.start||!f.end)return {error:'请选择完整的发送日期范围'};
  if(f.start>f.end)return {error:'开始日期不能晚于结束日期'};
  if((new Date(f.end)-new Date(f.start))/86400000>30)return {error:'单次查询最多31个自然日'};
  const phone=f.phone.replace(/[\s-]/g,'');
  if(phone&&!/^\+\d{7,15}$/.test(phone))return {error:'请输入区号及完整手机号，如 +86 19900000000'};
  return {rows:rows.filter(r=>{const d=stamp(r.sent).slice(0,10);return d>=f.start&&d<=f.end&&(!phone||r.phone.replace(/\s/g,'')===phone)&&(!f.request||r.id===f.request)&&(!f.scene||r.scene===f.scene)&&(!f.delivery||r.delivery===f.delivery)&&(!f.status||status(r)===f.status);})};
 }
 const mask=p=>p.slice(0,7)+'****'+p.slice(-4);
 const select=(name,label,values)=>`<label class="field"><span>${label}</span><select name="${name}" aria-label="${label}"><option value="">全部</option>${values.map(v=>`<option ${criteria[name]===v?'selected':''}>${v}</option>`).join('')}</select></label>`;
 function render(){
  const result=search(criteria),all=result.rows||[],pages=Math.max(1,Math.ceil(all.length/10));page=Math.min(page,pages);
  $('#content').innerHTML=`<div class="page-head"><div><h1>短信验证码查询</h1><p>用于排查用户收码与验证问题。以下均为虚构演示数据，不连接真实短信服务。</p></div></div><section class="panel panel-pad"><div class="tabs"><button data-sms="records" class="${tab==='records'?'active':''}">短信记录</button><button data-sms="audit" class="${tab==='audit'?'active':''}">查看审计</button></div>${tab==='audit'?`<p class="muted">仅展示本次页面会话内的演示审计；刷新后清空。</p>${simpleTable(audits,['时间','操作人','记录编号','操作','原因','结果'])}`:`<form id="smsFilter"><div class="form-grid"><label class="field"><span>手机号（完整号码精准查询）</span><input name="phone" aria-label="手机号" placeholder="+86 19900000000" value="${esc(criteria.phone)}"></label><label class="field"><span>请求编号</span><input name="request" aria-label="请求编号" placeholder="SMS-DEMO-001" value="${esc(criteria.request)}"></label><label class="field"><span>发送日期开始（北京时间）</span><input type="date" name="start" aria-label="发送日期开始" required value="${esc(criteria.start)}"></label><label class="field"><span>发送日期结束（北京时间）</span><input type="date" name="end" aria-label="发送日期结束" required value="${esc(criteria.end)}"></label>${select('scene','业务场景',scenes)}${select('delivery','发送状态',['发送成功','发送失败','发送中'])}${select('status','验证状态',['未验证','已验证','已过期','已失效','未生成'])}</div><div id="smsError" role="alert" class="error-msg" hidden></div><div class="btn-row" style="margin-top:16px"><button class="btn primary">查询</button><button type="button" class="btn" data-sms="reset">重置</button></div></form>`}</section>${tab==='records'?`<section class="panel" style="margin-top:16px"><div class="panel-title"><h3>短信记录</h3><span class="muted">共 ${all.length} 条 · 时间均为北京时间</span></div><div style="overflow:auto"><table><thead><tr>${['请求编号','手机号','业务场景','发送时间','失效时间','发送状态','验证状态','校验时间','失败原因','操作'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${all.slice((page-1)*10,page*10).map(r=>`<tr>${[r.id,mask(r.phone),r.scene,stamp(r.sent),r.delivery==='发送失败'?'—':stamp(r.expires),r.delivery,status(r),r.verified?stamp(r.verified):'—',r.reason].map(x=>`<td>${esc(x)}</td>`).join('')}<td><button class="link-btn" data-sms="detail" data-id="${r.id}">详情</button></td></tr>`).join('')||'<tr><td colspan="10" class="muted">暂无符合条件的短信记录，请调整查询条件。</td></tr>'}</tbody></table></div><div class="pagination"><button class="btn small" data-sms="prev" ${page===1?'disabled':''}>上一页</button><span>${page} / ${pages}</span><button class="btn small" data-sms="next" ${page===pages?'disabled':''}>下一页</button></div></section>`:''}`;
 }
 document.addEventListener('submit',e=>{if(e.target.id!=='smsFilter')return;e.preventDefault();const f=Object.fromEntries(new FormData(e.target));Object.keys(f).forEach(k=>f[k]=f[k].trim());const result=search(f);if(result.error){const box=$('#smsError');box.hidden=false;box.textContent=result.error;return;}criteria=f;page=1;render();});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-sms]');if(!b)return;const a=b.dataset.sms;
  if(a==='reset'){criteria=defaults();page=1;render();}
  if(a==='prev'||a==='next'){page+=a==='next'?1:-1;render();}
  if(a==='records'||a==='audit'){tab=a;render();}
  if(a==='detail'){const r=rows.find(x=>x.id===b.dataset.id);if(!r)return;const valid=r.delivery==='发送成功'&&status(r)==='未验证';modal('短信详情',`<p>请求编号：${r.id}</p><p>手机号：${mask(r.phone)}</p><p>业务场景：${r.scene}</p><p>发送状态：${r.delivery}；验证状态：${status(r)}</p><p>发送时间：${stamp(r.sent)}</p><p>失效时间：${r.delivery==='发送失败'?'—':stamp(r.expires)}</p><p>失败原因：${r.reason}</p><p>验证码：<b id="smsCode">******</b></p>${valid?`<label class="field"><span>查看原因（必填）</span><input id="smsReason" maxlength="100" placeholder="如：用户反馈收不到验证码"></label><button class="btn" data-sms="reveal" data-id="${r.id}">查看演示验证码</button>`:'<p class="muted">仅发送成功且未验证、未过期、未失效的验证码支持受控查看。</p>'}<p class="muted">当前为演示查询角色；正式系统须由服务端校验独立查看权限。演示码不用于登录。</p>`,'<button class="btn" data-action="close">关闭</button>');}
  if(a==='reveal'){const r=rows.find(x=>x.id===b.dataset.id),reason=$('#smsReason').value.trim();if(!reason)return toast('请填写查看原因',true);const valid=r&&r.delivery==='发送成功'&&status(r)==='未验证';audits.unshift({'时间':stamp(Date.now()),'操作人':'演示查询员','记录编号':r.id,'操作':'查看验证码','原因':reason,'结果':valid?'成功':'拒绝：验证码已不可用'});if(!valid){$('#smsCode').textContent='已不可用';b.disabled=true;return toast('验证码已不可用，请重新查询',true);}$('#smsCode').textContent=r.code;b.disabled=true;setTimeout(()=>{const el=$('#smsCode');if(el)el.textContent='******';},Math.min(15000,r.expires-Date.now()));}
 });
 return {render,search,status};
})();
