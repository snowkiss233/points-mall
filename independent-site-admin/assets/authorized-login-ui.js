/* 后台开关及验收入口：全部使用本地虚构身份。 */
(() => {
  const A = AuthorizedLogin, baseRender = render, baseOpen = openForm, baseValidation = validation, baseRow = rowAction, baseCommit = commit;
  commit = function(action,mutator) {
    const before = new Map(db.dictItems.filter(i=>A.isConfig(db,i.parentId)).map(i=>[i.key,i['是否启用']]));
    return baseCommit(action,()=>{
      mutator();
      for (const item of db.dictItems.filter(i=>A.isConfig(db,i.parentId))) if (before.has(item.key) && before.get(item.key)!==item['是否启用']) db.audit.unshift({time:dateNow(),operator:'演示运营',action:A.label(item.key)+'授权登录开关：'+before.get(item.key)+' → '+item['是否启用']});
    });
  };
  validation = function(key,draft,state) {
    return A.formIssue(db,key,draft,Model.get(db,key,state.rowId)) || baseValidation(key,draft,state);
  };
  openForm = function(key,id=null,defaults={}) {
    const before = forms.size;
    baseOpen(key,id,defaults);
    if (forms.size === before) return;
    const [fid,state] = [...forms.entries()].at(-1), form = document.getElementById(fid);
    if (key === 'dict' && A.isConfig(db,id)) form.elements.namedItem('字典编号').readOnly = true;
    if (key === 'dictItems' && A.isConfig(db,state.draft.parentId)) {
      form.elements.namedItem('key').readOnly = true;
      form.elements.namedItem('key类型').disabled = true;
      form.insertAdjacentHTML('afterbegin','<div class="notice">通过“是否启用”控制该平台的授权登录。关闭后拒绝该来源的授权登录，已注册账号保留；手机号登录仍查询两个平台。</div>');
      SelectControls.refresh(form);
    }
  };
  rowAction = function(key,id,op) {
    if (op === '删除' && (key === 'dict' && A.isConfig(db,id) || key === 'dictItems' && A.isConfig(db,Model.get(db,key,id)?.parentId))) return toast('授权登录配置需保留，请通过是否启用控制开关',true);
    return baseRow(key,id,op);
  };
  render = function() {
    baseRender();
    const active = current === 'dictItems' && A.isConfig(db,parentId);
    if (active || current === 'users') document.querySelector('.page-head .btn-row')?.insertAdjacentHTML('beforeend','<button class="btn primary" data-login-demo>登录流程验收</button>');
    if (active) {
      document.querySelector('.page-head [data-action="new"]')?.remove();
      document.querySelectorAll('[data-op="删除"]').forEach(b => b.remove());
      document.querySelector('.page-head')?.insertAdjacentHTML('afterend','<div class="notice">分别编辑 NN、雷神加速器的“是否启用”，保存即生效。两个开关默认禁用；“登录流程验收”可验证首次注册、重复授权和手机号登录复用账号。</div>');
    }
    if (current === 'dict') document.querySelectorAll('[data-op="删除"]').forEach(b => {if (A.isConfig(db,b.dataset.id)) b.remove();});
  };
  function demo() {
    const mid = modal('授权登录 · 流程验收',`<div class="notice">仅使用虚构身份，在本浏览器创建演示账号。平台授权仅传 UID MD5；来源平台用于区分账号。未接入真实授权、短信或手机号查询。</div><div data-login-body></div>`,'<button class="btn" data-action="close">关闭</button>',true);
    const root = document.getElementById(mid), body = root.querySelector('[data-login-body]');
    let tab = 'authorize';
    const select = (name,items) => `<select aria-label="${name}" name="${name}">${items.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select>`;
    function draw() {
      body.innerHTML = `<div class="login-status">${A.platforms.map(p=>`<span class="badge ${A.enabled(db,p.key)?'green':'gray'}">${p.name}授权：${A.enabled(db,p.key)?'启用':'禁用'}</span>`).join('')}<a class="btn small" href="${esc(Model.routeHref('dictItems',A.config(db)?.uid||''))}" data-phase-nav>配置开关</a></div><div class="tabs"><button class="${tab==='authorize'?'active':''}" data-login-tab="authorize">平台授权登录</button><button class="${tab==='phone'?'active':''}" data-login-tab="phone">手机号登录</button><button class="${tab==='accounts'?'active':''}" data-login-tab="accounts">演示账号</button></div><div data-login-panel></div>`;
      body.querySelectorAll('[data-login-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.loginTab;draw();});
      const panel = body.querySelector('[data-login-panel]');
      if (tab === 'accounts') {
        const rows = db.users.filter(u=>u._authorizedLoginDemo);
        panel.innerHTML = `<p>共 ${rows.length} 个本地演示账号。重复授权或手机号匹配应复用同一独立站 UID。</p>${rows.length?`<div class="table-wrap"><table><thead><tr><th>独立站 UID</th><th>登录来源</th><th>授权 UID MD5</th><th>手机号</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${esc(u['用户UID'])}</td><td>${esc(u['登录来源'])}</td><td class="login-hash">${db.loginDemo.bindings.filter(b=>b.userId===u.uid).map(b=>esc(A.label(b.platform)+': '+b.uidMd5)).join('<br>')||'—'}</td><td>${esc(u['手机号'])}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">尚未创建授权登录演示账号。</div>'}<p class="muted">这些记录也可在“用户管理 → 用户中心”查看；操作轨迹在“原型数据 → 原型操作记录”查看。</p>`;
        return;
      }
      panel.innerHTML = tab === 'authorize' ? `<div class="form-grid"><label class="field"><span>授权来源</span>${select('授权来源',A.platforms.map(p=>[p.key,p.name]))}</label><label class="field"><span>授权校验结果（模拟）</span>${select('授权校验结果',[['valid','校验通过'],['invalid','校验失败 / 凭据失效']])}</label></div><div class="notice login-payload"><strong>授权传入数据</strong><p data-login-payload></p><small>用户标识仅为 UID MD5，不传原始 UID 或手机号。来源由对应平台授权入口区分；MD5 不作为登录凭证。</small></div><button class="btn primary" data-login-run>模拟授权登录</button>` : `<div class="form-grid"><label class="field"><span>手机号场景</span>${select('手机号场景',A.samples.map(s=>[s.id,s.name]))}</label><label class="field"><span>手机号验证（模拟）</span>${select('手机号验证',[['unverified','未验证'],['verified','验证通过']])}</label></div><p class="muted">先验证手机号，再查询 NN、雷神加速器。开关仅控制平台授权入口；历史账号不会因开关关闭而删除。</p><p class="muted">先分别完成 NN、雷神授权，可验收样例 A / B 的账号复用和样例 C 的冲突提示。样例 E / F 可直接验收异常分支。</p><button class="btn primary" data-login-run>模拟手机号登录</button>`;
      panel.insertAdjacentHTML('beforeend','<div class="notice login-result" role="status" data-login-result>选择场景后执行，结果会显示匹配过程及独立站 UID。</div>');
      panel.addEventListener('change',()=>{panel.querySelector('[data-login-result]').textContent='场景已变更，请重新执行以查看结果。';});
      if (tab === 'authorize') {
        const update = () => {
          const platform = panel.querySelector('[name="授权来源"]').value;
          panel.querySelector('[data-login-payload]').textContent = A.label(platform)+' → 独立站：'+JSON.stringify({uidMd5:A.hashes[platform]});
        };
        panel.querySelector('[name="授权来源"]').addEventListener('change',update);update();
      }
      panel.querySelector('[data-login-run]').onclick = () => {
        let result;
        const authorizing = tab === 'authorize';
        const input = authorizing ? {platform:panel.querySelector('[name="授权来源"]').value,verified:panel.querySelector('[name="授权校验结果"]').value==='valid'} : {sampleId:panel.querySelector('[name="手机号场景"]').value,verified:panel.querySelector('[name="手机号验证"]').value==='verified'};
        if (authorizing) input.uidMd5=A.hashes[input.platform];
        const audit = authorizing ? '授权登录演示 · '+A.label(input.platform) : '手机号登录演示 · '+input.sampleId;
        if (!commit(audit,()=>{
          result=authorizing?A.authorize(db,input):A.phoneLogin(db,input);
          db.audit.unshift({time:dateNow(),operator:'演示运营',action:audit+'：'+result.message+(result.userId?'；独立站 UID '+Model.get(db,'users',result.userId)['用户UID']:'')});
        })) return;
        const user = result.userId && Model.get(db,'users',result.userId);
        panel.querySelector('[data-login-result]').innerHTML = `<strong>${esc(result.message)}</strong>${result.lookups?`<ul>${result.lookups.map(r=>`<li>${A.label(r.platform)}：${r.hash==='error'?'查询失败':!r.hash?'手机号不存在':r.userId?'手机号存在，匹配历史账号 '+esc(Model.get(db,'users',r.userId)['用户UID']):'手机号存在，未找到历史授权账号'}</li>`).join('')}</ul>`:''}${user?`<p>独立站 UID：<strong>${esc(user['用户UID'])}</strong></p><p>${result.status==='created'?'本次新建账号':'本次复用账号，未重复注册'} · 演示账号总数：${db.users.filter(u=>u._authorizedLoginDemo).length}</p>`:''}${result.status==='conflict'?'<p>待确认：多个历史账号的选择或处理方式。</p>':''}`;
        render();
      };
      SelectControls.refresh(root);
    }
    draw();
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-login-demo]'))demo();});
  const style=document.createElement('style');
  style.textContent='.login-status{display:flex;align-items:center;gap:12px;margin:20px 0;flex-wrap:wrap}.login-payload,.login-result{margin-top:18px;overflow-wrap:anywhere}.login-payload{margin-bottom:18px}.login-result p,.login-result li{margin:10px 0}.login-hash{font:12px/1.7 ui-monospace,monospace;overflow-wrap:anywhere;max-width:260px}';
  document.head.appendChild(style);
  render();
})();
