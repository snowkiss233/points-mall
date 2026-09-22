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
test('Initial synchronized catalog contains valid on-sale demo products only', `
  assert.equal(externalCatalog.length, 5);
  assert.ok(externalCatalog.every(p => p.state === '上架'));
  assert.ok(externalCatalog.every(p => Number.isFinite(p.amount) && p.amount >= 0));
  assert.ok(externalCatalog.every(p => placementEligibility(p).status === '可投放'));
  assert.ok(externalCatalog.every(p => !Object.hasOwn(p, 'siteId')));
  for (const state of ['下架', '已删除', '未知']) {
    const excluded = externalSourceCatalog.find(p => p.state === state);
    assert.ok(excluded);
    assert.equal(placementProduct(excluded), undefined);
  }
`);
test('Source and product ID define identity; legacy site keys migrate without retaining site', `
  const nnRef = { spu: 'SPU10001' };
  const extRef = externalCatalog[0];
  assert.notEqual(placementKey(nnRef), placementKey(extRef));
  assert.equal(placementKey(extRef), placementKey({...extRef, siteId:'legacy-site'}));
  assert.deepEqual(JSON.parse(placementKey(extRef)), ['external', extRef.spu]);
  const legacyKey = JSON.stringify(['external', 'legacy-site', extRef.spu]);
  assert.equal(placementKey(legacyKey), placementKey(extRef));
  assert.equal(placementProduct(legacyKey), extRef);
  assert.deepEqual(placementRef({...extRef, siteId:'legacy-site'}), {source:'external', spu:extRef.spu});
  assert.deepEqual(placementRef(legacyKey), {source:'external', spu:extRef.spu});
  assert.equal(uniqueDisplayProductCount([nnRef, extRef, {...extRef, subTemplateId:'second'}]), 2);
  displayProductRows = [{...nnRef, subTemplateId:'one'}];
  assert.equal(displayPlacementExists(extRef, 'one'), false);
  assert.equal(displayPlacementExists(nnRef, 'one'), true);
  assert.equal(displayPlacementExists(nnRef, 'two'), false);
`);
test('On-sale external products remain selectable without NN fields, price, or unexpired metadata', `
  assert.equal(externalCatalog[0].stock, undefined);
  assert.equal(placementEligibility(externalCatalog[0]).status, '可投放');
  assert.equal(placementEligibility({...externalCatalog[0], state:'未知'}).status, '不可投放');
  for (const overrides of [{amount:null}, {expiresAt:Date.now()-1}, {subtitle:''}, {stock:0, delivery:'未配置', cdkey:'库存不足'}]) {
    const candidate = {...externalCatalog[0], ...overrides};
    assert.equal(placementEligibility(candidate).status, '可投放');
    assert.equal(pickerAvailability(candidate).selectable, true);
  }
`);
test('NN stock, fulfillment, state and current-placement rules remain unchanged', `
  const nnProduct = products.find(p => placementEligibility(p).status === '可投放');
  assert.ok(nnProduct);
  assert.equal(placementEligibility({...nnProduct, stock:0}).status, '不可投放');
  assert.equal(placementEligibility({...nnProduct, delivery:'未配置'}).status, '不可投放');
  assert.equal(placementEligibility({...nnProduct, cdkey:'库存不足'}).status, '不可投放');
  assert.equal(pickerAvailability({...nnProduct, state:'下架'}).selectable, false);
  const rowsBeforeNnCheck = displayProductRows;
  displayProductRows = [{...placementRef(nnProduct), subTemplateId:activeDisplaySubTemplateId}];
  assert.equal(pickerAvailability(nnProduct).selectable, false);
  displayProductRows = rowsBeforeNnCheck;
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
test('Existing paused external reference can save; newly added invalid NN reference cannot', `
  const pausedRow = {...placementRef(externalSourceCatalog.find(p => p.state === '下架')), subTemplateId:'hot', sort:8, pinned:'是'};
  const pausedNnProduct = products.find(p => p.state !== '上架');
  assert.ok(pausedNnProduct);
  editingDisplayConfig = { products:[pausedRow] };
  assert.equal(newPlacementErrors({products:[pausedRow]}).length, 0);
  assert.equal(newPlacementErrors({products:[pausedRow, {...placementRef(pausedNnProduct), subTemplateId:'other'}]}).length, 1);
  assert.equal(displayProductRowHtml({...pausedRow, spu:'MISSING'}, {}, true, 0).includes('引用保留'), true);
`);
test('Changed NN selection blocks mixed-source confirmation; removing it allows one atomic addition', `
  activeDisplaySubTemplateId = 'hot';
  displaySubTemplateRows = [{id:'hot',name:'热门',sort:1}];
  displayProductRows = [];
  const selectedGood = externalCatalog[0];
  const selectedChanged = products.find(p => p.state === '上架');
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
test('External repeated choices are allowed and idempotent; other positions and templates can share the product', `
  const rowsBeforeSharedCheck = displayProductRows;
  const sharedProduct = externalCatalog[1];
  const sharedRow = {...placementRef(sharedProduct), subTemplateId:'hot', sort:8, pinned:'是'};
  displayProductRows = [sharedRow];
  displayConfigs.push({id:'SHARED_TEST_TEMPLATE', products:[{...sharedRow}]});
  assert.equal(pickerAvailability(sharedProduct).selectable, true);
  pickerSelection = new Set([placementKey(sharedProduct)]);
  addSelectedProductsToDisplay();
  assert.equal(pickerSelection.size, 0);
  assert.equal(displayProductRows.length, 1);
  assert.deepEqual(displayProductRows[0], sharedRow);
  assert.equal(sharedRow.sort, 8);
  assert.equal(sharedRow.pinned, '是');
  activeDisplaySubTemplateId = 'other';
  assert.equal(pickerAvailability(sharedProduct).selectable, true);
  addProductsToDisplay([placementKey(sharedProduct), placementKey(sharedProduct)]);
  assert.equal(displayProductRows.length, 2);
  assert.equal(displayProductRows[1].subTemplateId, 'other');
  assert.equal(uniqueDisplayProductCount(displayProductRows), 1);
  assert.ok(displayProductRows.every(row => !Object.hasOwn(row, 'siteId')));
  displayConfigs.pop();
  activeDisplaySubTemplateId = 'hot';
  displayProductRows = rowsBeforeSharedCheck;
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
test('Every listed external row can be selected together, including previously added or stale-price products', `
  const externalBeforeSelectionCheck = {...externalCatalog[0]};
  externalCatalog[0].amount = null;
  externalCatalog[0].expiresAt = Date.now() - 1;
  assert.equal(displayPlacementExists(externalCatalog[0], 'hot'), true);
  document.getElementById('pickerFilterSource').value = 'external';
  actualRenderPicker();
  assert.equal(pickerVisibleProducts.length, externalCatalog.length);
  assert.equal(document.getElementById('productPickerTbody').innerHTML.includes('disabled'), false);
  document.getElementById('pickerSelectAll').onchange({target:{checked:true}});
  assert.equal(pickerSelection.size, externalCatalog.length);
  for (const product of externalCatalog) assert.ok(pickerSelection.has(placementKey(product)));
  Object.keys(externalCatalog[0]).forEach(key => delete externalCatalog[0][key]);
  Object.assign(externalCatalog[0], externalBeforeSelectionCheck);
  discardPickerSelection();
  resetPickerFilters();
`);
test('Unknown external reference cannot resolve to a same-ID NN product', `
  const nnOnlyProduct = products.find(p => !externalCatalog.some(external => external.spu === p.spu));
  assert.ok(nnOnlyProduct);
  assert.equal(placementProduct({source:'external',spu:nnOnlyProduct.spu}), undefined);
  assert.equal(placementProduct({source:'external',siteId:'legacy-site',spu:'SPU10001'}), externalCatalog[0]);
  assert.equal(placementProduct('SPU10001').source, undefined);
`);

(async () => {
  run(`const confirmedBeforeFailure = externalSyncConfirmedAt; const catalogBeforeFailure = JSON.stringify(externalCatalog); const relationsBeforeSync = JSON.stringify(displayProductRows);`);
  await run('refreshExternalCatalog(true)');
  test('Sync failure retains the confirmed catalog, last success time and relations', `
    assert.equal(externalSyncConfirmedAt, confirmedBeforeFailure);
    assert.equal(JSON.stringify(externalCatalog), catalogBeforeFailure);
    assert.equal(placementEligibility(externalCatalog[0]).status, '可投放');
    assert.equal(JSON.stringify(displayProductRows), relationsBeforeSync);
    assert.equal(externalSyncBusy, false);
  `);
  await run('refreshExternalCatalog()');
  test('Complete refresh imports only on-sale products and all of them remain selectable', `
    assert.equal(externalCatalog.length, 5);
    assert.ok(externalCatalog.every(p => p.state === '上架'));
    assert.equal(placementEligibility(externalCatalog.find(p => p.spu === 'EXT20005')).status, '可投放');
    assert.equal(placementEligibility(externalCatalog.find(p => p.spu === 'EXT20004')).status, '可投放');
    assert.ok(externalCatalog.every(p => pickerAvailability(p).selectable));
    assert.ok(externalCatalog.every(p => !Object.hasOwn(p, 'siteId')));
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
    const catalogBeforeRemoval = JSON.stringify(externalCatalog);
    const confirmedBeforeRemoval = externalSyncConfirmedAt;
    pickerSelection = new Set([placementKey(sourceChanging)]);
    sourceChanging.state = '下架';
  `);
  await run('refreshExternalCatalog(true)');
  test('Failed refresh does not remove cached products or references', `
    assert.ok(placementProduct(sourceChanging));
    assert.equal(JSON.stringify(externalCatalog), catalogBeforeRemoval);
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
  `);
  await run('refreshExternalCatalog(false, false)');
  test('Incomplete on-sale snapshot retains all cached products, references and last success time', `
    assert.equal(JSON.stringify(externalCatalog), catalogBeforeRemoval);
    assert.equal(externalSyncConfirmedAt, confirmedBeforeRemoval);
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
    assert.equal(displayEligibleCount([retainedRow]), 1);
    assert.equal(pickerSelection.size, 1);
    assert.equal(externalSyncBusy, false);
  `);
  await run('refreshExternalCatalog()');
  test('Confirmed disappearance removes the candidate and pending choice while retaining saved references', `
    assert.equal(placementProduct(sourceChanging), undefined);
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
    assert.equal(displayEligibleCount([retainedRow]), 0);
    pickerReviewMode = false;
    actualRenderPicker();
    assert.equal(pickerVisibleProducts.some(p => p.spu === sourceChanging.spu), false);
    assert.equal(pickerSelection.size, 0);
    addSelectedProductsToDisplay();
    assert.equal(JSON.stringify(displayProductRows), beforeRemoval);
    assert.equal(pickerReviewMode, false);
    pickerReviewMode = true;
    actualRenderPicker();
    assert.equal(pickerVisibleProducts.length, 0);
    assert.equal(document.getElementById('pickerSelectionError').textContent, '');
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
