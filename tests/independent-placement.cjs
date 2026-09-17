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
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, focus() {} });
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

run(`const actualRenderPicker = renderProductPickerTable; renderDisplayProductRows = () => {}; renderProductPickerTable = () => {}; renderDisplayTable = () => {}; toast = () => {};`);
test('Initial synchronized catalog contains on-sale products only', `
  assert.equal(externalCatalog.length, 5);
  assert.ok(externalCatalog.every(p => p.state === '上架'));
  for (const state of ['下架', '已删除', '未知']) {
    const excluded = externalSourceCatalog.find(p => p.state === state);
    assert.ok(excluded);
    assert.equal(placementProduct(excluded), undefined);
  }
`);
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
  const restoring = externalCatalog[1];
  restoring.state = '下架';
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
  restoring.state = '上架';
`);
test('Existing paused reference can save; newly added invalid reference cannot', `
  const pausedRow = {...placementRef(externalSourceCatalog.find(p => p.state === '下架')), subTemplateId:'hot', sort:8, pinned:'是'};
  editingDisplayConfig = { products:[pausedRow] };
  assert.equal(newPlacementErrors({products:[pausedRow]}).length, 0);
  assert.equal(newPlacementErrors({products:[pausedRow, {...pausedRow, subTemplateId:'other'}]}).length, 1);
  assert.equal(displayProductRowHtml({...pausedRow, spu:'MISSING'}, {}, true, 0).includes('引用保留'), true);
`);
test('Changed selection blocks the entire confirmation; removing it allows one atomic addition', `
  activeDisplaySubTemplateId = 'hot';
  displaySubTemplateRows = [{id:'hot',name:'热门',sort:1}];
  displayProductRows = [];
  const selectedGood = externalCatalog[0];
  const selectedChanged = externalCatalog[1];
  selectedChanged.state = '下架';
  pickerSelection = new Set([placementKey(selectedGood),placementKey(selectedChanged)]);
  addSelectedProductsToDisplay();
  assert.equal(displayProductRows.length, 0);
  assert.equal(pickerSelection.size, 2);
  assert.equal(pickerReviewMode, true);
  pickerSelection.delete(placementKey(selectedChanged));
  addSelectedProductsToDisplay();
  assert.equal(displayProductRows.length, 1);
  assert.equal(displayProductRows[0].spu, selectedGood.spu);
  assert.equal(pickerSelection.size, 0);
  addProductsToDisplay([placementKey(selectedGood)]);
  assert.equal(displayProductRows.length, 1);
  selectedChanged.state = '上架';
`);
test('Cancel and overlay dismissal discard only pending choices, not previously added rows', `
  const committedSnapshot = JSON.stringify(displayProductRows);
  pickerSelection.add(placementKey(externalCatalog[1]));
  pickerReviewMode = true;
  closeModal('productPickerModal');
  assert.equal(pickerSelection.size, 0);
  assert.equal(pickerReviewMode, false);
  assert.equal(JSON.stringify(displayProductRows), committedSnapshot);
  pickerSelection.add(placementKey(externalCatalog[1]));
  closeAllLayers();
  assert.equal(pickerSelection.size, 0);
  assert.equal(JSON.stringify(displayProductRows), committedSnapshot);
`);
test('Cross-page review ignores browse filters and restores the browse page without mutating the form', `
  const formBeforeBrowse = JSON.stringify(displayProductRows);
  const catalogSizeBeforePagination = externalCatalog.length;
  externalCatalog.push(...[1,2,3].map(i => ({...externalCatalog[1], spu:'PAGE_TEST_' + i, landingUrl:'https://shop.example.com/products/PAGE_TEST_' + i})));
  resetPickerFilters();
  pickerPage = 2;
  pickerSelection = new Set([placementKey(products[0]), placementKey(externalCatalog[1])]);
  actualRenderPicker();
  assert.equal(pickerPage, 2);
  assert.equal(pickerVisibleProducts.length, 2);
  document.getElementById('pickerFilterKeyword').value = 'no-match';
  pickerReviewMode = true;
  actualRenderPicker();
  assert.equal(pickerVisibleProducts.length, 2);
  assert.equal(pickerPage, 2);
  pickerSelection.delete(placementKey(externalCatalog[1]));
  actualRenderPicker();
  assert.equal(pickerVisibleProducts.length, 1);
  document.getElementById('pickerFilterKeyword').value = '';
  pickerReviewMode = false;
  actualRenderPicker();
  assert.equal(pickerPage, 2);
  assert.equal(pickerSelection.size, 1);
  assert.equal(JSON.stringify(displayProductRows), formBeforeBrowse);
  externalCatalog.splice(catalogSizeBeforePagination);
`);
test('Visible source, name and ID filters work; reset preserves pending choices', `
  document.getElementById('pickerFilterSource').value = 'external';
  document.getElementById('pickerFilterKeyword').value = '星际';
  document.getElementById('pickerFilterSpu').value = 'SPU10001';
  actualRenderPicker();
  assert.equal(pickerVisibleProducts.length, 1);
  assert.equal(pickerVisibleProducts[0].source, 'external');
  document.getElementById('pickerFilterSpu').value = 'NON_EXISTENT';
  actualRenderPicker();
  assert.equal(pickerVisibleProducts.length, 0);
  resetPickerFilters();
  actualRenderPicker();
  assert.equal(pickerSelection.size, 1);
  assert.equal(pickerVisibleProducts.length, 9);
  assert.ok(pickerVisibleProducts.every(p => p.state === '上架'));
  assert.equal(document.getElementById('pickerFilterSource').value, 'all');
  assert.equal(document.getElementById('pickerFilterKeyword').value, '');
  assert.equal(document.getElementById('pickerFilterSpu').value, '');
  assert.equal(document.getElementById('productPickerTbody').innerHTML.includes('查看资料'), false);
  discardPickerSelection();
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
  test('Refresh imports only on-sale products, recovers expiry, and retains data validation', `
    assert.equal(externalCatalog.length, 5);
    assert.ok(externalCatalog.every(p => p.state === '上架'));
    assert.equal(placementEligibility(externalCatalog.find(p => p.spu === 'EXT20005')).status, '可投放');
    assert.equal(placementEligibility(externalCatalog.find(p => p.spu === 'EXT20004')).status, '不可投放');
    assert.equal(externalCatalog.some(p => ['EXT20003','EXT20007','EXT20008'].includes(p.spu)), false);
    assert.equal(JSON.stringify(displayProductRows), relationsBeforeSync);
    assert.equal(externalSyncLogs.length, 2);
    assert.equal(externalSyncBusy, false);
  `);
  run(`
    const sourceChanging = externalSourceCatalog.find(p => p.spu === 'EXT20002');
    const retainedRow = {...placementRef(sourceChanging), subTemplateId:'saved', sort:9, pinned:'是'};
    displayProductRows.push(retainedRow);
    const beforeRemoval = JSON.stringify(displayProductRows);
    pickerSelection = new Set([placementKey(sourceChanging)]);
    sourceChanging.state = '下架';
  `);
  await run('refreshExternalCatalog(true)');
  test('Failed refresh does not remove cached products or references', `
    assert.ok(placementProduct(sourceChanging));
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
  `);
  await run('refreshExternalCatalog()');
  test('Confirmed disappearance removes the candidate and blocks pending additions while retaining saved references', `
    assert.equal(placementProduct(sourceChanging), undefined);
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
    assert.equal(displayEligibleCount([retainedRow]), 0);
    pickerReviewMode = false;
    actualRenderPicker();
    assert.equal(pickerVisibleProducts.some(p => p.spu === sourceChanging.spu), false);
    addSelectedProductsToDisplay();
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
    assert.equal(pickerSelection.size, 1);
    assert.equal(pickerReviewMode, true);
    actualRenderPicker();
    assert.ok(document.getElementById('pickerSelectionError').textContent.includes('不可添加'));
    assert.ok(document.getElementById('productPickerTbody').innerHTML.includes('商品不存在'));
    discardPickerSelection();
    sourceChanging.state = '上架';
  `);
  await run('refreshExternalCatalog()');
  test('Same-ID republication restores existing eligibility with original sort and pin', `
    assert.ok(placementProduct(sourceChanging));
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
    assert.equal(displayEligibleCount([retainedRow]), 1);
    assert.equal(retainedRow.sort, 9);
    assert.equal(retainedRow.pinned, '是');
    displayProductRows = displayProductRows.filter(row => row !== retainedRow);
    const afterManualRemoval = JSON.stringify(displayProductRows);
  `);
  await run('refreshExternalCatalog()');
  test('Refresh never recreates manually removed placement links', `
    assert.equal(JSON.stringify(displayProductRows), afterManualRemoval);
  `);
  console.log(passed + ' scenario groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
