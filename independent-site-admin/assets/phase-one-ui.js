/* 一期交互：复用原表单与提交机制，仅补充本期配置字段及反馈。 */
(() => {
  const baseRender = render, baseOpen = openForm, baseValidation = validation, baseOptions = options;
  const baseFilteredRows = filteredRows;
  filteredRows = function() {
    const rows = baseFilteredRows();
    return current === 'dictItems' && PhaseOne.isSearchHint(db,parentId) ? rows.sort(PhaseOne.searchHintCompare) : rows;
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
    if (key === 'dict' && id && PhaseOne.isSearchHint(db,id)) get('字典编号').readOnly = true;
    if (key === 'dictItems' && PhaseOne.isSearchHint(db,state.draft.parentId)) {
      if (!id) get('排序值').value = Math.max(0,...db.dictItems.filter(r=>r.parentId===state.draft.parentId).map(r=>r['排序值']))+1;
      get('key类型').disabled = true;
      help('value','客户端搜索框内展示的底纹文案，不能为空。');
      help('key','字典项标识，同一搜索底纹字典内不能重复。');
      help('排序值','数值越小越先展示；相同排序按创建时间先后展示。单条固定，多条每 3 秒轮播；仅启用项参与。');
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
      help('推荐区域','新增 7 个专区为候选演示枚举。即将发售专区只能选择未发售商品。');
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
      if (!id) {get('发售状态').value='未发售';state.draft['发售状态']='未发售';}
      const statusField = form.querySelector('[data-field="发售状态"]'), timeField = form.querySelector('[data-field="发售时间"]');
      const schedule = document.createElement('div');schedule.className='stack';
      statusField.before(schedule);schedule.append(statusField,timeField);
      help('发售时间','非必填；未填写时，客户端显示“时间待定”。日期到达后不会自动变更发售状态。');
      updateDependencies(fid);
      help('发售状态','未发售商品可不绑定供货商、无库存上架，仅展示“敬请期待”，不可购买。上架商品改为已发售并保存时，无可用库存将自动下架。');
      help('角标标签','非必填，单选；可选项由数据字典中的“角标标签”维护。');
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
