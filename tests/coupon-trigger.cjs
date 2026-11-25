const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let serial = 0;
const context = {
  ROUTES: {}, SCHEMA: {}, GROUPS: [['商品管理', []]],
  Model: {
    uid: prefix => `${prefix}-${++serial}`,
    get: (db, key, id) => db[key].find(row => row.uid === id),
  },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../independent-site-admin/assets/coupons.js'), 'utf8') + '\nglobalThis.Coupons = Coupons;', context);
const Coupons = context.Coupons;

const start = '2026-11-25T00:00:00.000Z';
const later = hours => new Date(Date.parse(start) + hours * 3600000).toISOString();
function fixture() {
  const db = {
    users: [{uid: 'user-1', '用户UID': 'U-1'}, {uid: 'user-2', '用户UID': 'U-2'}],
    products: [{uid: 'sku-1', '商品名称': '商品一'}], orders: [],
    couponData: Object.fromEntries(['templates','batches','scopes','grantTasks','grantItems','userCoupons','redemptions','events'].map(key => [key, []])),
  };
  const template = Coupons.saveTemplate(db, {name:'商详券', currency:'CNY',ruleType:'FIXED_AMOUNT',face:1000,threshold:0,scope:'SKU',skuIds:['sku-1']}, '', start);
  return {db, template};
}
function plan(db, template, scenes, strategy = null) {
  const d = {name:'测试发券',templateId:template.id,method:'MANUAL',triggerScenes:scenes,repeatPolicy:strategy,
    limit:null,userLimit:null,audienceType:'ALL',issueFrom:start,issueTo:later(48),validityType:'AFTER_RECEIPT',
    validDurationSeconds:3600,validFrom:null,validTo:null};
  const batch = Coupons.saveBatch(db,d,'',start);
  Coupons.activatePlan(db,batch.id,start);
  return batch;
}

test('商品详情页触发循环发放，仅在上一张券失效并再次访问后补发', () => {
  const {db,template} = fixture();
  const batch = plan(db,template,['HOME','PRODUCT_DETAIL','GAME_LIST'],'CYCLE');
  assert.equal(batch.status,'ENABLED');
  assert.deepEqual([...batch.triggerScenes],['HOME','PRODUCT_DETAIL','GAME_LIST']);
  assert.equal(batch.issued,0);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(0.1)).issued,true);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(0.5)).issued,false);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(1.2)).issued,true);
  assert.equal(batch.issued,2);
  assert.equal(db.couponData.grantTasks[0].source,'EVENT');
  assert.equal(Coupons.validate(db).length,0);
});

test('多场景共用只触发一次策略，且空场景不能创建', () => {
  const {db,template} = fixture();
  const once = plan(db,template,['HOME','PRODUCT_DETAIL','PAYMENT_SUCCESS'],'ONCE');
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(0.1)).issued,true);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(1.2)).onceComplete,true);
  assert.equal(once.issued,1);
  assert.throws(()=>plan(db,template,[],'CYCLE'),/请至少选择一个有效触发场景/);
  assert.equal(Coupons.validate(db).length,0);
});
