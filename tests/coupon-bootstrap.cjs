const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime() {
  const context = vm.createContext({ console, URLSearchParams, structuredClone });
  for (const file of ['schema','data','model','phase-one','v123-schema','authorized-login','coupons','activity-pages']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../independent-site-admin/assets', file + '.js'), 'utf8'), context, {filename: file + '.js'});
  }
  return source => vm.runInContext(source, context);
}

test('fresh browser initializes the complete model and preserves historical fixed-validity coupons', () => {
  const run = runtime();
  run('var db = Model.prepare(makeSeed())');
  assert.equal(run('Model.validate(db).length'), 0);
  assert.ok(run("db.couponData.batches.some(b => b.legacyPlan && b.validityType === 'FIXED')"));
  assert.ok(run("db.couponData.batches.some(b => b.triggerScenes.includes('PRODUCT_DETAIL') && b.repeatPolicy === 'CYCLE')"));
  const before = run('JSON.stringify(db.couponData.userCoupons)');
  run('db = Model.prepare(JSON.parse(JSON.stringify(db)))');
  assert.equal(run('JSON.stringify(db.couponData.userCoupons)'), before);
});

test('older stored data without the reusable demo upgrades without losing coupons', () => {
  const run = runtime();
  run('var db = Model.prepare(makeSeed()); delete db.couponData.reusableDemo');
  const ids = run('JSON.stringify(db.couponData.userCoupons.map(c => c.id))');
  run('db = Model.prepare(JSON.parse(JSON.stringify(db)))');
  assert.equal(run('Model.validate(db).length'), 0);
  for (const id of JSON.parse(ids)) assert.ok(run(`db.couponData.userCoupons.some(c => c.id === ${JSON.stringify(id)})`));
});
