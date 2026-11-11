/* 活动落地页原型数据与路由。页面内容限制为模板预设模块，供本地演示。 */
const ACTIVITY_PAGE_KEYS={activityPages:{name:'专题页管理',path:'/marketing/activityPages'}};
for(const [key,page] of Object.entries(ACTIVITY_PAGE_KEYS)){ROUTES[key]=page.path;SCHEMA[key]={name:page.name,desc:'基于预设页面模板配置专题内容，支持预览、启用和停用。'};}
const activityGroup=GROUPS.find(group=>group[0]==='营销管理');
if(activityGroup){activityGroup[1]=activityGroup[1].filter(key=>key!=='activityTemplates');activityGroup[1].unshift(...Object.keys(ACTIVITY_PAGE_KEYS));activityGroup[1]=[...new Set(activityGroup[1])];}
else GROUPS.splice(GROUPS.findIndex(group=>group[0]==='商品管理')+1,0,['营销管理',Object.keys(ACTIVITY_PAGE_KEYS)]);
const ActivityPages=(()=>{
 const copy=value=>JSON.parse(JSON.stringify(value));
 const now=()=>new Date().toLocaleString('sv-SE');
 const defaultTemplates=()=>[
  {id:'tpl-hero-grid',name:'主视觉 + 商品网格',description:'顶部主视觉 Banner，下方商品卡片网格，适合新品首发与促销专题。',layout:'hero-grid',sections:[{id:'sec-hot',title:'热门精选',layout:'grid',productIds:['1','3','4','5']},{id:'sec-more',title:'更多好物',layout:'grid',productIds:['6','8','11']}],status:'启用',builtIn:true,updatedAt:'2026-11-01 10:00:00'},
  {id:'tpl-anchor',name:'主视觉 + 分区锚点',description:'顶部主视觉、右侧锚点导航和多个商品分区，适合长页面促销活动。',layout:'anchor-sections',sections:[{id:'sec-best',title:'人气榜单',layout:'grid',productIds:['1','3','5','6']},{id:'sec-special',title:'限时特惠',layout:'grid',productIds:['2','4','8','10']}],status:'启用',builtIn:true,updatedAt:'2026-11-01 10:00:00'}
 ];
 function seed(db){if(!db.activityTemplates)db.activityTemplates=defaultTemplates();if(!db.activityPages)db.activityPages=[{id:'act-demo-1111',name:'好游戏不落单 · 双十一精选',slug:'double-eleven-demo',templateId:'tpl-anchor',status:'启用',startAt:'2026-11-01T00:00',endAt:'2026-11-15T23:59',heroTitle:'好游戏不落单',heroSubtitle:'愿望单不孤单 · 好价限时',heroImage:'',sections:[{id:'demo-sec-1',title:'热门榜单',layout:'grid',productIds:['1','3','5','6']},{id:'demo-sec-2',title:'限时特惠',layout:'grid',productIds:['2','4','8','10']}],createdAt:'2026-11-01 10:00:00',updatedAt:'2026-11-10 16:30:00',publishedAt:'2026-11-10 16:30:00'}];for(const row of [...db.activityTemplates,...db.activityPages]){row.refs||={};if(db.activityPages.includes(row)){if(['草稿','已发布','已下线'].includes(row.status))row.status=row.status==='已发布'?'启用':'停用';delete row.buttonText;delete row.buttonStyle;delete row.floatingText;delete row.background;}}}
 function ensureMenus(db){let parent=db.permissions.find(row=>row['菜单类型']==='一级菜单'&&row['权限名称']==='营销管理');if(!parent){parent={uid:'perm-marketing-activity-parent','权限名称':'营销管理','菜单类型':'一级菜单','组件':'Layout','路径':'/marketing','状态':'启用','创建时间':now(),refs:{}};db.permissions.push(parent);}parent['路径']='/marketing';const obsoleteTemplateMenu=db.permissions.find(item=>item['路径']==='/marketing/activityTemplates');if(obsoleteTemplateMenu){db.permissions=db.permissions.filter(item=>item.uid!==obsoleteTemplateMenu.uid);for(const role of db.roles)db.rolePermissions[role.uid]=(db.rolePermissions[role.uid]||[]).filter(uid=>uid!==obsoleteTemplateMenu.uid);}const menuIds=[];for(const [key,page]of Object.entries(ACTIVITY_PAGE_KEYS)){let row=db.permissions.find(item=>item['路径']===page.path);if(!row){row={uid:'perm-'+key,'权限名称':page.name,'菜单类型':'子菜单','父级菜单':'营销管理','组件':key,'路径':page.path,'状态':'启用','创建时间':now(),refs:{'父级菜单':parent.uid}};db.permissions.push(row);}else{row['权限名称']=page.name;row['状态']='启用';row.refs||={};row.refs['父级菜单']=parent.uid;}menuIds.push(row.uid);}for(const role of db.roles.filter(row=>['管理员','平台运营'].includes(row['角色名称']))){db.rolePermissions[role.uid]=[...new Set([...(db.rolePermissions[role.uid]||[]),parent.uid,...menuIds])];}}
 function upgrade(db){seed(db);ensureMenus(db);}
 const productName=(db,id)=>db.products.find(row=>row.uid===id)?.['商品名称']||'商品已删除';
 return {seed,upgrade,productName,defaultTemplates,now,copy};
})();
const _makeSeedWithActivityPages=makeSeed;
makeSeed=function(){const db=_makeSeedWithActivityPages();ActivityPages.seed(db);return db;};
