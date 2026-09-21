/* 一期交互：复用原表单与提交机制，仅补充配置反馈及本地效果预览。 */
(() => {
  const baseRender = render, baseOpen = openForm, baseValidation = validation, baseRow = rowAction, baseOptions = options, baseFiltered = filteredRows;
  filteredRows = function() {
    const rows = baseFiltered();
    return current === 'columns' ? rows.sort((a,b)=>Number(a['排序'])-Number(b['排序'])) : rows;
  };
  options = function(spec,value,empty,draft={},key=current,field='') {
    const html = baseOptions(spec,value,empty,draft,key,field);
    if (spec !== 'tags' && spec !== 'columns') return html;
    const template = document.createElement('template');
    template.innerHTML = '<select>'+html+'</select>';
    for (const option of template.content.querySelectorAll('option')) {
      const row = Model.get(db,spec,option.value);
      if (row && row[spec === 'tags' ? '状态' : '栏目状态'] !== (spec === 'tags' ? '开启' : '启用')) {
        option.disabled = true;
        option.textContent += '（已停用）';
      }
    }
    return template.content.querySelector('select').innerHTML;
  };
  validation = function(key,draft,state) {
    return PhaseOne.formIssue(db,key,draft,Model.get(db,key,state.rowId)) || baseValidation(key,draft,state);
  };
  openForm = function(key,id=null,defaults={}) {
    const oldCount = forms.size;
    baseOpen(key,id,defaults);
    if (forms.size === oldCount) return;
    const [fid,state] = [...forms.entries()].at(-1), form = document.getElementById(fid);
    if (!form) return;
    const get = name => form.elements.namedItem(name);
    const help = (name,text) => form.querySelector('[data-field="'+name+'"]')?.insertAdjacentHTML('beforeend','<div class="field-help">'+esc(text)+'</div>');
    if (key === 'games') {
      if (!id) {get('发售状态').value='未发售';state.draft['发售状态']='未发售';}
      help('发售状态','未发售可展示，但按钮为“敬请期待”。发行日期不自动切换发售状态。');
      help('游戏模式','按多选演示；单人、多人、在线为候选值，可在标签管理维护。');
    }
    if (key === 'tags') {
      if (!id) get('标签类型').value = filters['标签类型'] || '游戏类型';
      if (id && Model.references(db,'tags',id).length) {
        get('标签类型').disabled = true;
        help('标签类型','已有游戏引用；如需另一类型，请新建标签。');
      }
      help('标签','同一类型不能重名；不同类型可以同名，关联独立保存。');
    }
    if (key === 'recommend') help('推荐区域','新增 7 个专区为候选演示枚举。即将发售专区选品需关联未发售游戏。');
    if (key === 'dict' && id && PhaseOne.isRisk(db,id)) {
      get('字典编号').readOnly = true;
      help('字典编号','一期演示规则使用固定编号；请在字典配置中调整启停。');
    }
    if (key === 'dictItems' && PhaseOne.isRisk(db,state.draft.parentId)) {
      get('key').readOnly = true;
      get('key类型').disabled = true;
      form.insertAdjacentHTML('afterbegin','<div class="notice">比较下单与支付的用户侧城市是否一致。只配置规则启停，处置动作待确认；可从列表点击“规则试算”验证。</div>');
    }
    if (key === 'products') {
      const box = document.createElement('div');box.className='notice';box.dataset.phaseGame='';form.prepend(box);
      const draw = () => {
        const game = Model.get(db,'games',get('绑定游戏类别')?.value);
        box.textContent = game ? '关联游戏：'+game['游戏名称']+'；发售状态：'+game['发售状态']+'。在游戏资料维护。' : '选择游戏后显示关联游戏的发售状态。';
      };
      get('绑定游戏类别')?.addEventListener('change',draw);draw();
    }
    SelectControls.refresh(form);
  };
  render = function() {
    baseRender();
    if (current === 'columns') document.querySelector('.page-head .btn-row')?.insertAdjacentHTML('beforeend','<button class="btn" data-phase="recommend">返回推荐管理</button>');
    if (current === 'dictItems' && PhaseOne.isRisk(db,parentId)) {
      document.querySelector('.page-head [data-action="new"]')?.remove();
      document.querySelector('.page-head .btn-row')?.insertAdjacentHTML('beforeend','<button class="btn primary" data-phase="risk">规则试算</button>');
      document.querySelectorAll('[data-op="删除"]').forEach(b => b.remove());
      document.querySelector('.page-head')?.insertAdjacentHTML('afterend','<div class="notice">演示规则默认停用。编辑字典项的“是否启用”，再点击“规则试算”。同城、异城、无法判断分别展示；不执行支付拦截或停发。</div>');
    }
  };
  rowAction = function(key,id,op) {
    if (op === '展示预览') return preview(key,Model.get(db,key,id));
    if (op === '专区预览') return sectionPreview(Model.get(db,key,id));
    return baseRow(key,id,op);
  };

  function preview(key,row) {
    const product = key === 'products' ? row : null;
    const game = product ? PhaseOne.productGames(db,product)[0] : row;
    const mid = modal('展示预览 · '+(row?.['商品名称']||row?.['游戏名称']||''),'<div data-preview-content></div>','<button class="btn" data-action="close">关闭</button>',true);
    const root = document.getElementById(mid), area = root.querySelector('[data-preview-content]');
    const draw = () => {
      const outcome = PhaseOne.purchase(db,game,product);
      const title = row?.['商品名称'] || game?.['游戏名称'] || '暂无游戏';
      area.innerHTML = `<div class="notice">本地效果预览：读取已保存的后台配置，不访问真实商城、不创建订单。</div><section class="phase-preview"><div class="phase-cover">${esc(title.slice(0,2))}</div><div><span class="badge blue">${esc(game?.['发售状态']||'未配置')}</span><h2>${esc(title)}</h2><p>${esc(game?.['游戏副标题']||'游戏详情展示')}</p><p>游戏类型：${esc(fmt(game?.['游戏类型']))}</p><p>游戏模式：${esc(fmt(game?.['游戏模式']))}</p>${product?'<p>商品状态：'+esc(product['状态'])+' · 售价 ¥ '+esc(product['人民币售价'])+'</p>':''}<button class="btn primary" data-preview-buy ${outcome.allowed?'':'disabled'}>${esc(outcome.label)}</button><p class="muted">${esc(outcome.message)}</p></div></section><div class="notice" data-preview-result>根据已保存的发售状态展示购买按钮。</div>`;
      area.querySelector('[data-preview-buy]').onclick=()=>{
        if (!outcome.allowed) return;
        area.querySelector('[data-preview-result]').textContent='购买效果演示完成，不创建订单、不扣库存。';
      };
    };
    draw();
  }
  function sectionPreview(row) {
    const column = Model.get(db,'columns',row.refs?.['推荐区域']);
    const ids = [...(row['选择商品']||[])].sort((a,b)=>Number(row['商品排序']?.[a]||0)-Number(row['商品排序']?.[b]||0));
    const products = ids.map(uid=>Model.get(db,'products',uid)).filter(Boolean);
    const eligible = products.filter(p=>p['状态']==='上架' && PhaseOne.productGames(db,p).every(g=>g['状态']==='启用') && (column?.['栏目名称']!=='即将发售'||PhaseOne.productGames(db,p).every(g=>g['发售状态']==='未发售')));
    const active = row['状态']==='启用' && column?.['栏目状态']==='启用';
    const mid = modal('专区预览 · '+row['栏目名称'],`<div class="notice">栏目类型：${esc(column?.['栏目名称']||'未知')} · 栏目排序：${esc(column?.['排序'])}。此处演示已保存的选品与排序，不生成自动榜单。</div>${!active?'<div class="empty">栏目或推荐记录已停用，当前不展示。</div>':eligible.length?`<div class="phase-cards">${eligible.map(p=>`<article class="panel panel-pad"><span class="badge blue">${esc(PhaseOne.productGames(db,p).some(g=>g['发售状态']==='未发售')?'敬请期待':'已发售')}</span><h3>${esc(p['商品名称'])}</h3><p>¥ ${esc(p['人民币售价'])}</p><button class="btn" data-product-preview="${esc(p.uid)}">查看商品</button></article>`).join('')}</div>`:'<div class="empty">尚无可展示商品，请检查选品、游戏发售状态与上下架。</div>'}`,'<button class="btn" data-action="close">关闭</button>',true);
    document.getElementById(mid).querySelectorAll('[data-product-preview]').forEach(b=>b.onclick=()=>preview('products',Model.get(db,'products',b.dataset.productPreview)));
  }
  function riskTrial() {
    const cityChoices = [['CN-420100','中国大陆 · 武汉'],['CN-310100','中国大陆 · 上海'],['HK-HKG','中国香港 · 香港'],['','无法识别']];
    const select = (name,value) => `<select aria-label="${name}" name="${name}">${cityChoices.map(([code,label])=>`<option value="${code}" ${code===value?'selected':''}>${label}</option>`).join('')}</select>`;
    const mid = modal('飞码规则试算',`<div class="notice">使用虚构用户侧 IP 和手动选择的城市模拟比较，不做真实 IP 定位。支付回调服务器 IP 不作为用户支付 IP。处置动作待确认，本页仅显示结果。</div><div class="btn-row" style="margin-bottom:18px"><button class="btn" data-sample="same">同城样例</button><button class="btn" data-sample="different">异城样例</button><button class="btn" data-sample="unknown">城市缺失样例</button></div><div class="form-grid"><div class="field"><span>下单用户 IP（虚构）</span><input readonly value="192.0.2.10"></div><div class="field"><span>支付用户 IP（虚构）</span><input readonly value="198.51.100.20"></div><div class="field"><span>下单城市</span>${select('下单城市','CN-420100')}</div><div class="field"><span>支付城市</span>${select('支付城市','CN-310100')}</div></div><div class="notice" style="margin-top:20px" data-risk-result role="status">点击“执行试算”读取当前字典规则。</div>`,'<button class="btn" data-action="close">关闭</button><button class="btn primary" data-risk-run>执行试算</button>',true);
    const root = document.getElementById(mid);
    const order = root.querySelector('[name="下单城市"]'), payment = root.querySelector('[name="支付城市"]');
    root.querySelectorAll('[data-sample]').forEach(b=>b.onclick=()=>{
      order.value='CN-420100';payment.value=b.dataset.sample==='same'?'CN-420100':b.dataset.sample==='different'?'CN-310100':'';
      root.querySelector('[data-risk-result]').textContent='样例已切换，请执行试算。';SelectControls.refresh(root);
    });
    root.querySelector('[data-risk-run]').onclick=()=>{
      const result = PhaseOne.compareCities(db,order.value,payment.value);
      if (commit('飞码演示试算：'+result.result,()=>{})) root.querySelector('[data-risk-result]').textContent=result.result+'：'+result.detail;
    };
    SelectControls.refresh(root);
  }
  function guide() {
    const risk = db.dict.find(r=>r['字典编号']===PhaseOne.riskCode);
    modal('一期验收指引 · 2026-09-21',`<div class="notice">本次交付 5 项后台配置。旧演示数据自动升级并保留备份，无需恢复初始数据。新增专区和模式为候选演示值，风控处置未定，仅演示判断结果。</div><ol class="phase-guide"><li><h3>未发售展示</h3><p>在游戏类别将“星海远征（一期演示）”设为未发售，点击展示预览，应显示不可点击的“敬请期待”；改为已发售后再预览。</p><a class="btn" href="#${ROUTES.games}" data-phase-nav>进入游戏类别</a></li><li><h3>NN / 雷神授权登录</h3><p>数据字典 → 授权登录开关 → 字典配置，分别启用 NN、雷神。打开登录流程验收，重复授权应复用 UID；手机号验证后查询两平台，再登录历史账号。查询失败或账号冲突会提示并暂停。</p><a class="btn" href="${esc(Model.routeHref('dictItems',AuthorizedLogin.config(db)?.uid||''))}" data-phase-nav>进入授权登录字典</a> <button class="btn" data-login-demo>登录流程验收</button></li><li><h3>推荐专区</h3><p>推荐管理 → 栏目列表可见原有 3 项与新增 7 项；编辑排序或停用后，推荐区域选项同步。新增推荐并选品，保存后点击专区预览。</p><a class="btn" href="#${ROUTES.recommend}" data-phase-nav>进入推荐管理</a></li><li><h3>标签类型与游戏模式</h3><p>标签管理按“游戏模式”筛选可见单人、多人、在线；新建模式后，在游戏编辑的游戏模式中选择并保存。存量“多人”仍属于游戏类型，同名模式是独立记录。</p><a class="btn" href="#${ROUTES.tags}" data-phase-nav>进入标签管理</a></li><li><h3>飞码城市比较</h3><p>字典配置中编辑规则，将“是否启用”改为启用；使用规则试算验证同城、异城、城市缺失，再停用验证规则关闭。</p><a class="btn" href="${esc(Model.routeHref('dictItems',risk?.uid||''))}" data-phase-nav>进入飞码字典</a></li></ol><p class="muted">已移除游戏购买站点配置及相关预览交互。仅修改本浏览器演示数据；授权、短信、查询、支付和风控接口均未接入。</p>`,'<button class="btn" data-action="close">开始验收</button>',true);
  }

  document.addEventListener('click',event=>{
    const button = event.target.closest('[data-phase]');
    if (button?.dataset.phase==='risk') riskTrial();
    if (button?.dataset.phase==='recommend') navigate('recommend');
    if (button?.dataset.phase==='guide') guide();
    if (event.target.closest('[data-phase-nav]')) {document.getElementById('overlays').innerHTML='';forms.clear();}
  });
  document.querySelector('.top-actions').insertAdjacentHTML('afterbegin','<button class="btn primary small" data-phase="guide">一期验收指引</button>');
  const style = document.createElement('style');
  style.textContent='.phase-preview{display:grid;grid-template-columns:180px 1fr;gap:28px;padding:24px;border:1px solid #e5eaf2;border-radius:12px;margin-bottom:18px}.phase-cover{min-height:220px;border-radius:10px;background:linear-gradient(140deg,#16304e,#2877b5);display:grid;place-items:center;font-size:44px;color:white}.phase-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.phase-guide{padding-left:24px}.phase-guide li{margin-bottom:24px}.phase-guide p{line-height:1.8}.phase-preview h2{margin:14px 0}.phase-preview p{margin:12px 0}@media(max-width:700px){.phase-preview{grid-template-columns:1fr}.phase-cards{grid-template-columns:1fr}.phase-cover{min-height:100px}}';
  document.head.appendChild(style);
  render();
})();
