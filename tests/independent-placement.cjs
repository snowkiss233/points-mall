// Run with: node tests/independent-placement.cjs
// Exercise the prototype's actual data functions without booting the unrelated admin modules.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n    init\(\);/, '');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], addEventListener() {} });
  return elements.get(id);
};
const context = vm.createContext({
  URL, console, setTimeout: fn => { fn(); return 1; }, clearTimeout() {}, window: {},
  document: { getElementById: element, querySelectorAll: () => [], querySelector: () => null },
  assert,
});
vm.runInContext(script, context);
const run = source => vm.runInContext(source, context);
let passed = 0;
function test(name, source) { run(source); passed++; console.log('PASS', name); }

run(`renderDisplayProductRows = () => {}; renderProductPickerTable = () => {}; renderDisplayTable = () => {}; updatePickerSelectedCount = () => {}; toast = () => {};`);
test('Source and site isolation, plus placement-level deduplication', `
  const nnRef = { spu: 'SPU10001' };
  const extRef = externalCatalog[0];
  assert.notEqual(placementKey(nnRef), placementKey(extRef));
  assert.notEqual(placementKey(extRef), placementKey({...extRef, siteId:'second-site'}));
  assert.equal(uniqueDisplayProductCount([nnRef, extRef, {...extRef, subTemplateId:'second'}]), 2);
  displayProductRows = [{...nnRef, subTemplateId:'one'}];
  assert.equal(displayPlacementExists(extRef, 'one'), false);
  assert.equal(displayPlacementExists(nnRef, 'one'), true);
  assert.equal(displayPlacementExists(nnRef, 'two'), false);
`);
test('External eligibility does not require NN SKU, inventory, or fulfillment', `
  assert.equal(externalCatalog[0].stock, undefined);
  assert.equal(placementEligibility(externalCatalog[0]).status, '可投放');
  assert.equal(placementEligibility({...externalCatalog[0], state:'未知'}).status, '不可投放');
  assert.equal(placementEligibility({...externalCatalog[0], amount:null}).status, '不可投放');
  assert.equal(placementEligibility({...externalCatalog[0], expiresAt:Date.now()-1}).status, '不可投放');
  assert.equal(placementEligibility({...externalCatalog[0], landingUrl:'https://evil.example/products/SPU10001'}).status, '不可投放');
  assert.equal(placementEligibility({...externalCatalog[0], landingUrl:'https://shop.example.com/products/another'}).status, '不可投放');
  assert.equal(placementEligibility({...externalCatalog[0], subtitle:''}).status, '可投放');
`);
test('Down/up retains references, sort and pin; template windows still gate visibility', `
  const restoring = externalCatalog[2];
  const savedRow = {...placementRef(restoring), subTemplateId:'hot', sort:8, pinned:'是'};
  const config = {state:'上架', startTime:nowText(new Date(Date.now()-86400000)), endTime:nowText(new Date(Date.now()+86400000)), products:[savedRow]};
  const savedSnapshot = JSON.stringify(savedRow);
  assert.equal(displayVisibleCount(config), 0);
  restoring.state = '上架';
  assert.equal(displayVisibleCount(config), 1);
  assert.equal(JSON.stringify(savedRow), savedSnapshot);
  assert.equal(displayVisibleCount({...config, state:'下架'}), 0);
  assert.equal(displayVisibleCount({...config, endTime:'2020-01-01 00:00'}), 0);
  assert.equal(displayVisibleCount({...config, products:[]}), 0);
  assert.equal(displayEligibleCount([{...savedRow, spu:'NEW_ID'}]), 0);
  restoring.state = '下架';
`);
test('Existing paused reference can save; newly added invalid reference cannot', `
  const pausedRow = {...placementRef(externalCatalog[2]), subTemplateId:'hot', sort:8, pinned:'是'};
  editingDisplayConfig = { products:[pausedRow] };
  assert.equal(newPlacementErrors({products:[pausedRow]}).length, 0);
  assert.equal(newPlacementErrors({products:[pausedRow, {...pausedRow, subTemplateId:'other'}]}).length, 1);
  assert.equal(displayProductRowHtml(pausedRow, {}, true, 0).includes('暂停展示'), true);
  assert.equal(displayProductRowHtml({...pausedRow, spu:'MISSING'}, {}, true, 0).includes('引用保留'), true);
`);
test('Bulk submit handles a source-state change and adds valid off-page selection only once', `
  activeDisplaySubTemplateId = 'hot';
  displaySubTemplateRows = [{id:'hot',name:'热门',sort:1}];
  displayProductRows = [];
  const selectedGood = externalCatalog[0];
  const selectedChanged = externalCatalog[1];
  selectedChanged.state = '下架';
  pickerSelection = new Set([placementKey(selectedGood),placementKey(selectedChanged)]);
  addSelectedProductsToDisplay();
  assert.equal(displayProductRows.length, 1);
  assert.equal(displayProductRows[0].spu, selectedGood.spu);
  assert.equal(pickerSelection.size, 0);
  addProductsToDisplay([placementKey(selectedGood)]);
  assert.equal(displayProductRows.length, 1);
  selectedChanged.state = '上架';
`);
test('Unknown external reference cannot resolve to a same-ID NN product', `
  assert.equal(placementProduct({source:'external',siteId:'unknown-site',spu:'SPU10001'}), undefined);
  assert.equal(placementProduct('SPU10001').source, undefined);
`);

(async () => {
  run(`const confirmedBeforeFailure = externalSyncConfirmedAt; const itemConfirmedBeforeFailure = externalCatalog[0].confirmedAt; const expiryBeforeFailure = externalCatalog[0].expiresAt; const relationsBeforeSync = JSON.stringify(displayProductRows);`);
  await run('refreshExternalCatalog(true)');
  test('Sync failure retains last confirmed time, expiry and relations', `
    assert.equal(externalSyncConfirmedAt, confirmedBeforeFailure);
    assert.equal(externalCatalog[0].confirmedAt, itemConfirmedBeforeFailure);
    assert.equal(externalCatalog[0].expiresAt, expiryBeforeFailure);
    assert.equal(placementEligibility(externalCatalog[0]).status, '可投放');
    assert.equal(JSON.stringify(displayProductRows), relationsBeforeSync);
    assert.equal(externalSyncBusy, false);
  `);
  await run('refreshExternalCatalog()');
  test('Successful refresh recovers expired data, preserves real invalid states, never rebuilds removed relations', `
    assert.equal(placementEligibility(externalCatalog[4]).status, '可投放');
    assert.equal(placementEligibility(externalCatalog[2]).status, '不可投放');
    assert.equal(placementEligibility(externalCatalog[3]).status, '不可投放');
    assert.equal(JSON.stringify(displayProductRows), relationsBeforeSync);
    assert.equal(externalSyncLogs.length, 2);
    assert.equal(externalSyncBusy, false);
  `);
  console.log(passed + ' scenario groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
