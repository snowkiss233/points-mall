/* V1.2.3 后台配置演示；仅修改当前浏览器中的原型数据。 */
(() => {
  const previousOpen = openForm;
  const previousRead = readForm;
  const previousDependencies = updateDependencies;
  const previousValidation = validation;

  const fieldWrap = (form, name) => [...form.querySelectorAll('[data-field]')].find(el => el.dataset.field === name);
  const toggle = (form, name, visible) => {
    const wrap = fieldWrap(form,name);
    if (!wrap) return;
    wrap.hidden = !visible;
    wrap.querySelectorAll('input,select,textarea,button').forEach(el => el.disabled = !visible);
  };
  const categoryIsCdk = categoryId => db.categories.find(c => c.uid === categoryId)?.['分类名称'] === '游戏道具 CDK';
  const gameBanner = columnId => db.columns.find(c => c.uid === columnId)?.['栏目名称'] === '游戏内页Banner';

  openForm = function(key,id=null,defaults={}) {
    const before = forms.size;
    previousOpen(key,id,defaults);
    if (forms.size === before) return;
    const [fid,state] = [...forms.entries()].at(-1);
    const form = document.getElementById(fid);
    if (!form) return;
    const help = (name,message) => fieldWrap(form,name)?.insertAdjacentHTML('beforeend',`<div class="field-help">${esc(message)}</div>`);
    if (key === 'games') {
      if (!id) {form.elements.namedItem('推荐方式').value='自动匹配';state.draft['推荐方式']='自动匹配';}
      help('推荐方式','默认推荐由运营选择游戏；自动匹配按当前游戏的“游戏类型”标签筛选已启用、可售的其他游戏。');
      help('默认推荐游戏','仅在“默认推荐”时生效；不可选择当前游戏。');
    }
    if (key === 'recommend') {
      help('关联游戏','栏目类型为“游戏内页Banner”时必选，Banner 仅展示在该游戏内页。');
      help('图片','游戏内页Banner需配置图片、链接类型和链接地址。');
    }
    if (key === 'products') {
      if (!id) {form.elements.namedItem('商详样式').value='当前默认样式';state.draft['商详样式']='当前默认样式';}
      help('商品别名','每行一个，可用于搜索命中；不会替换商品正式名称。');
      help('商详样式','仅“游戏道具 CDK”分类可选择。定制样式只展示当前 SKU 配置图片，并隐藏开发商、发行商、发行日期卡片。');
    }
    updateDependencies(fid);
  };

  updateDependencies = function(fid,changed='') {
    previousDependencies(fid,changed);
    const state=forms.get(fid),form=document.getElementById(fid);
    if (!state || !form) return;
    if (state.key === 'games') toggle(form,'默认推荐游戏',form.elements.namedItem('推荐方式')?.value === '默认推荐');
    if (state.key === 'recommend') {
      const banner=gameBanner(form.elements.namedItem('推荐区域')?.value);
      toggle(form,'关联游戏',banner);
      toggle(form,'选择商品',!banner);
    }
    if (state.key === 'products') {
      const eligible=form.elements.namedItem('商品类型')?.value === '独立商品' && categoryIsCdk(form.elements.namedItem('商品分类')?.value);
      toggle(form,'商详样式',eligible);
      if (!eligible) form.elements.namedItem('商详样式').value='当前默认样式';
    }
    if (typeof SelectControls !== 'undefined') SelectControls.refresh(form);
  };

  readForm = function(fid) {
    const out=previousRead(fid),state=forms.get(fid),form=document.getElementById(fid);
    if (state?.key === 'products') {
      out['商品别名']=[...new Set((form.elements.namedItem('商品别名')?.value||'').split(/[\n,，、]/).map(s=>s.trim()).filter(Boolean))];
      if (!categoryIsCdk(out['商品分类']) || out['商品类型'] !== '独立商品') out['商详样式']='当前默认样式';
    }
    if (state?.key === 'recommend' && !gameBanner(out['推荐区域'])) out['关联游戏']='';
    if (state?.key === 'games' && out['推荐方式'] !== '默认推荐') out['默认推荐游戏']=[];
    return out;
  };

  validation = function(key,draft,state) {
    if (key === 'games' && draft['推荐方式'] === '默认推荐') {
      if (!draft['默认推荐游戏']?.length) return {field:'默认推荐游戏',message:'请至少选择一个默认推荐游戏'};
      if (state.rowId && draft['默认推荐游戏'].includes(state.rowId)) return {field:'默认推荐游戏',message:'不能推荐当前游戏'};
    }
    if (key === 'recommend' && gameBanner(draft['推荐区域'])) {
      if (!draft['关联游戏']) return {field:'关联游戏',message:'请选择 Banner 所属游戏'};
      if (!draft['图片']) return {field:'图片',message:'请上传游戏内页 Banner 图片'};
      if (!draft['链接类型'] || !draft['链接地址']?.trim()) return {field:'链接地址',message:'请配置 Banner 链接类型和地址'};
    }
    if (key === 'products') {
      const aliases=draft['商品别名']||[];
      if (new Set(aliases.map(s=>s.toLocaleLowerCase())).size !== aliases.length) return {field:'商品别名',message:'商品别名不能重复'};
      if (aliases.some(s=>s.toLocaleLowerCase()===draft['商品名称']?.trim().toLocaleLowerCase())) return {field:'商品别名',message:'商品别名不能与正式商品名相同'};
    }
    return previousValidation(key,draft,state);
  };

  document.addEventListener('submit',event=>{
    if (event.target?.id !== 'filterForm' || current !== 'orders') return;
    event.preventDefault();event.stopImmediatePropagation();
    filters={};
    for (const f of activeSchema().filters) {
      const el=event.target.elements.namedItem(f.label);
      filters[f.label]=f.type==='range'?[event.target.elements.namedItem(f.label+'开始')?.value||'',event.target.elements.namedItem(f.label+'结束')?.value||'']:f.type==='multi'?[...el.selectedOptions].map(o=>o.value).filter(Boolean):el?.value||'';
    }
    page=1;render();
  },true);
})();
