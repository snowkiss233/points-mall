/* 授权登录字典配置：维护后台开关、校验与操作记录。 */
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
    if (active) {
      document.querySelector('.page-head [data-action="new"]')?.remove();
      document.querySelectorAll('[data-op="删除"]').forEach(b => b.remove());
      document.querySelector('.page-head')?.insertAdjacentHTML('afterend','<div class="notice">分别编辑 NN、雷神加速器的“是否启用”，保存即生效。两个开关独立控制。</div>');
    }
    if (current === 'dict') document.querySelectorAll('[data-op="删除"]').forEach(b => {if (A.isConfig(db,b.dataset.id)) b.remove();});
  };
  render();
})();
