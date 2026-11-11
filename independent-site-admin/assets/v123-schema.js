/* V1.2.3 字段及旧演示存档兼容；不改动既有营销、交易配置。 */
SCHEMA.recommend.columns.splice(4,0,'关联游戏');
SCHEMA.recommend.fields.splice(1,0,F('关联游戏','select',false,'games'));
SCHEMA.orders.columns.splice(SCHEMA.orders.columns.indexOf('渠道名称')+1,0,'供应商');
SCHEMA.orders.filters.push(F('订单来源','multi',false,['独立站','NN 商店','PC 客户端','活动页']),F('渠道名称','multi',false,'channels'),F('供应商','multi',false,'suppliers'),F('是否提取','select',false,['是','否']));
SCHEMA.products.filters.splice(SCHEMA.products.filters.findIndex(f=>f.label==='状态'),0,F('商品分类','select',false,'categories'));
PRODUCT_FIELDS.splice(1,0,F('商品别名','aliasList'));
PRODUCT_FIELDS.splice(PRODUCT_FIELDS.findIndex(f=>f.label==='商品分类')+1,0,F('商详样式','select',true,['当前默认样式','游戏道具 CDK 定制样式']));
SCHEMA.products.columns.splice(2,0,'商品别名','商详样式');

const V123 = (() => {
  const hasCdkCategory=(db,id)=>db.categories.find(c=>c.uid===id)?.['分类名称']==='游戏道具 CDK';
  const gameBanner=(db,id)=>db.columns.find(c=>c.uid===id)?.['栏目名称']==='游戏详情页Banner';
  function upgrade(db) {
    let removedRecommendation=false;
    for(const game of db.games) {
      removedRecommendation ||= '推荐方式' in game || '默认推荐游戏' in game || '默认推荐游戏' in (game.refs||{});
      delete game['推荐方式'];delete game['默认推荐游戏'];if(game.refs)delete game.refs['默认推荐游戏'];
    }
    if(removedRecommendation) db.audit?.unshift({time:new Date().toISOString(),operator:'原型升级',action:'移除 V1.2.3 演示中重复新增的游戏推荐配置；游戏详情页 Banner 配置保留'});
    for(const product of db.products) {product['商品别名']||=[];product['商详样式']||='当前默认样式';}
    for(const rec of db.recommend) {rec.refs||={};rec.refs['关联游戏']||='';rec['关联游戏']||='';}
    for(const order of db.orders) order['供应商']??='';
    if(!db.categories.some(c=>c['分类名称']==='游戏道具 CDK')) db.categories.push({uid:'v123-category-cdk',ID:'C104','商品类别':'游戏商品','分类名称':'游戏道具 CDK','排序':4,'状态':'启用',refs:{}});
    const previousBanner=db.columns.find(c=>c['栏目名称']==='游戏内页Banner');
    if(previousBanner) {previousBanner['栏目名称']='游戏详情页Banner';previousBanner['说明']='游戏详情页营销 Banner';}
    if(!db.columns.some(c=>c['栏目名称']==='游戏详情页Banner')) db.columns.push({uid:'v123-game-banner','栏目名称':'游戏详情页Banner','栏目标识':'game-detail-banner','栏目状态':'启用','排序':db.columns.length+1,'说明':'游戏详情页营销 Banner',refs:{}});
    if(db.version===1) {
      const product=db.products.find(p=>p.uid==='1');
      if(product)product['商品别名']=['T29礼包','战争雷霆 T29'];
    }
  }
  function validate(db) {
    const errors=[];
    for(const product of db.products) {
      const aliases=product['商品别名'];
      if(!Array.isArray(aliases)||aliases.some(s=>typeof s!=='string'||!s.trim())||new Set((aliases||[]).map(s=>s.trim().toLocaleLowerCase())).size!==(aliases||[]).length)errors.push(`商品 ${product.uid}：商品别名格式错误或重复`);
      if(product['商详样式']==='游戏道具 CDK 定制样式'&&(!hasCdkCategory(db,product.refs?.['商品分类'])||product['商品类型']!=='独立商品'))errors.push(`商品 ${product.uid}：定制商详样式仅适用于游戏道具 CDK`);
    }
    for(const rec of db.recommend)if(gameBanner(db,rec.refs?.['推荐区域'])&&!rec.refs?.['关联游戏'])errors.push(`推荐 ${rec.uid}：游戏详情页Banner必须关联游戏`);
    return errors;
  }
  return {upgrade,validate};
})();
