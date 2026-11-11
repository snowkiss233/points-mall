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
  const gameBanner = columnId => db.columns.find(c => c.uid === columnId)?.['栏目名称'] === '游戏详情页Banner';

  openForm = function(key,id=null,defaults={}) {
    const before = forms.size;
    previousOpen(key,id,defaults);
    if (forms.size === before) return;
    const [fid,state] = [...forms.entries()].at(-1);
    const form = document.getElementById(fid);
    if (!form) return;
    const help = (name,message) => fieldWrap(form,name)?.insertAdjacentHTML('beforeend',`<div class="field-help">${esc(message)}</div>`);
    if (key === 'recommend') {
      help('关联游戏','可选择多个游戏；不选时在所有游戏对应的商品详情页展示，选中后仅在所选游戏对应的商品详情页展示。');
      help('图片','游戏详情页Banner需配置图片、链接类型和链接地址。');
    }
    if (key === 'products') {
      if (!id) {form.elements.namedItem('商详样式').value='当前默认样式';state.draft['商详样式']='当前默认样式';}
      help('商品别名','每行一个；客户端关键词按连续字符包含匹配别名，英文字母不区分大小写。命中后仍展示正式商品名称。');
      help('商详样式','仅“游戏道具 CDK”分类可选择，默认使用当前默认样式；需要定制展示时手动选择“游戏道具 CDK 商详定制样式”。定制样式只展示当前 SKU 配置图片，并隐藏开发商、发行商、发行日期卡片。');
    }
    updateDependencies(fid);
  };

  updateDependencies = function(fid,changed='') {
    previousDependencies(fid,changed);
    const state=forms.get(fid),form=document.getElementById(fid);
    if (!state || !form) return;
    if (state.key === 'recommend') {
      const banner=gameBanner(form.elements.namedItem('推荐区域')?.value);
      toggle(form,'关联游戏',banner);
      toggle(form,'选择商品',!banner);
    }
    if (state.key === 'products') {
      const eligible=categoryIsCdk(form.elements.namedItem('商品分类')?.value);
      toggle(form,'商详样式',eligible);
      if (!eligible) form.elements.namedItem('商详样式').value='当前默认样式';
    }
    if (typeof SelectControls !== 'undefined') SelectControls.refresh(form);
  };

  readForm = function(fid) {
    const out=previousRead(fid),state=forms.get(fid),form=document.getElementById(fid);
    if (state?.key === 'products') {
      out['商品别名']=[...new Set((form.elements.namedItem('商品别名')?.value||'').split(/[\n,，、]/).map(s=>s.trim()).filter(Boolean))];
      if (!categoryIsCdk(out['商品分类'])) out['商详样式']='当前默认样式';
    }
    if (state?.key === 'recommend' && !gameBanner(out['推荐区域'])) out['关联游戏']=[];
    return out;
  };

  validation = function(key,draft,state) {
    if (key === 'recommend' && gameBanner(draft['推荐区域'])) {
      if (!draft['图片']) return {field:'图片',message:'请上传游戏详情页 Banner 图片'};
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
