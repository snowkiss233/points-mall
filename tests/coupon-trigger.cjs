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
function plan(db, template, scene, strategy = null) {
  const d = {name:'测试发券',templateId:template.id,method:'MANUAL',triggerScenes:[scene],repeatPolicy:strategy,
    limit:null,userLimit:null,audienceType:'ALL',issueFrom:start,issueTo:scene==='PRODUCT_DETAIL'?later(48):null,validityType:scene==='PRODUCT_DETAIL'?'AFTER_RECEIPT':'FIXED',
    validDurationSeconds:3600,validFrom:start,validTo:later(24)};
  const batch = Coupons.saveBatch(db,d,'',start);
  Coupons.activatePlan(db,batch.id,start);
  return batch;
}

test('商品详情页触发循环发放，仅在上一张券失效并再次访问后补发', () => {
  const {db,template} = fixture();
  const batch = plan(db,template,'PRODUCT_DETAIL','CYCLE');
  assert.equal(batch.status,'ENABLED');
  assert.equal(batch.issued,0);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(0.1)).issued,true);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(0.5)).issued,false);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(1.2)).issued,true);
  assert.equal(batch.issued,2);
  assert.equal(db.couponData.grantTasks[0].source,'EVENT');
  assert.equal(Coupons.validate(db).length,0);
});

test('只触发一次与计划开启时发放保留各自行为', () => {
  const {db,template} = fixture();
  const once = plan(db,template,'PRODUCT_DETAIL','ONCE');
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(0.1)).issued,true);
  assert.equal(Coupons.grantOnProductDetail(db,'sku-1','U-1',later(1.2)).onceComplete,true);
  assert.equal(once.issued,1);
  Coupons.setBatchStatus(db,once.id,'CLOSED',later(2));
  const immediate = plan(db,template,'PLAN_START');
  assert.equal(immediate.status,'CLOSED');
  assert.equal(immediate.issued,2);
  assert.equal(Coupons.validate(db).length,0);
});
