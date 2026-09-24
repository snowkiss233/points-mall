/* 一期交互：复用原表单与提交机制，仅补充本期配置字段及反馈。 */
(() => {
  const baseRender = render, baseOpen = openForm, baseValidation = validation, baseOptions = options;
  const baseFilteredRows = filteredRows;
  filteredRows = function() {
    const rows = baseFilteredRows();
    return current === 'searchHints' ? rows.sort((a,b)=>a['排序']-b['排序']||String(a['创建时间']||'').localeCompare(String(b['创建时间']||''))||a.uid.localeCompare(b.uid)) : rows;
  };
  options = function(spec,value,empty,draft={},key=current,field='') {
    const html = baseOptions(spec,value,empty,draft,key,field);
    if (spec !== 'tags' && spec !== 'columns') return html;
    const template = document.createElement('template');
    template.innerHTML = '<select>'+html+'</select>';
    for (const option of template.content.querySelectorAll('option')) {
      const row = Model.get(db,spec,option.value);
      if (row && spec === 'tags' && key === 'games' && field === '游戏标签') option.textContent = row['标签类型']+' / '+row['标签'];
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
      help('发售状态','未发售改为已发售并保存时，关联的上架商品若无可用库存将自动下架，有库存的保持上架。');
      help('游戏标签','统一多选游戏标签；选项按字典维护的标签类型标识，新增类型无需增加表单字段。');
      const guide = get('激活指南'), platforms = get('绑定平台');
      let guideTouched = false;
      const preload = () => {
        if (guideTouched) return;
        guide.value = PhaseOne.guideForPlatforms(db,[...platforms.selectedOptions].map(o=>o.value),guide.value);
      };
      guide.addEventListener('input',()=>{guideTouched=true;});
      platforms.addEventListener('change',preload);
      const saved = Model.get(db,'games',id);
      if (!saved || !Object.prototype.hasOwnProperty.call(saved,'激活指南')) preload();
      help('激活指南','选择 Steam 时向空白字段预填指南，可编辑；已有内容不会被覆盖。正式文案待运营提供，当前预填内容为演示占位。');
    }
    if (key === 'searchHints') {
      if (!id) get('排序').value = Math.max(0,...db.searchHints.map(r=>r['排序']))+1;
      help('排序','数值越小越先展示；相同排序按创建时间先后展示。仅启用的文案参与轮播，间隔固定为 3 秒。');
    }
    if (key === 'tags') {
      if (!id) get('标签类型').value = filters['标签类型'] || db.dictItems.find(r=>PhaseOne.isTagType(db,r.parentId)&&r.value==='游戏类型')?.uid || '';
      if (id && Model.references(db,'tags',id).length) {
        get('标签类型').disabled = true;
        help('标签类型','已有游戏引用；如需另一类型，请新建标签。');
      }
      help('标签','同一类型不能重名；不同类型可以同名，关联独立保存。');
    }
    if (key === 'recommend') {
      help('推荐区域','新增 7 个专区为候选演示枚举。即将发售专区选品需关联未发售游戏。');
      const title = form.querySelector('[data-field="栏目名称"]'), subtitle = form.querySelector('[data-field="栏目副标题"]');
      const titles = document.createElement('div');
      titles.className = 'stack';
      title.before(titles);titles.append(title,subtitle);
      help('栏目副标题','展示在客户端栏目主标题下方，未填写时不展示、不占位。');
    }
    if (key === 'dict' && id && PhaseOne.isRisk(db,id)) {
      get('字典编号').readOnly = true;
      help('字典编号','一期演示规则使用固定编号；请在字典配置中调整启停。');
    }
    if (key === 'dictItems' && PhaseOne.isRisk(db,state.draft.parentId)) {
      get('key').readOnly = true;
      get('key类型').disabled = true;
      form.insertAdjacentHTML('afterbegin','<div class="notice">比较下单与支付的用户侧城市是否一致。只配置规则启停，处置动作待确认。</div>');
    }
    if (key === 'products') {
      const box = document.createElement('div');box.className='notice';box.dataset.phaseGame='';form.prepend(box);
      const draw = () => {
        if (get('商品类型')?.value === '组合商品') {box.textContent='组合商品按组成的独立商品分别校验供货与库存；包含未发售游戏时，整个组合不可购买。';return;}
        const game = Model.get(db,'games',get('绑定游戏类别')?.value);
        box.textContent = game ? '关联游戏：'+game['游戏名称']+'；发售状态：'+game['发售状态']+'（在游戏类别维护）。'+(game['发售状态']==='未发售'?'该游戏的商品可不绑定供货商、无库存上架，仅展示“敬请期待”，不可购买。':'已发售商品上架须绑定已启用供货商，且关联货源有可用库存；可先保存为下架，再配置供货商。') : '选择游戏后显示发售状态及上架规则；发售状态在游戏类别维护。';
      };
      get('绑定游戏类别')?.addEventListener('change',draw);get('商品类型')?.addEventListener('change',draw);draw();
    }
    SelectControls.refresh(form);
  };
  render = function() {
    baseRender();
    if (current === 'dictItems' && PhaseOne.isRisk(db,parentId)) {
      document.querySelector('.page-head [data-action="new"]')?.remove();
      document.querySelectorAll('[data-op="删除"]').forEach(b => b.remove());
      document.querySelector('.page-head')?.insertAdjacentHTML('afterend','<div class="notice">通过字典项的“是否启用”配置飞码城市一致性规则；比较与后续处置由服务端执行。</div>');
    }
  };
  render();
})();
