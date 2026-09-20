/* The native select remains the form's source of truth. */
window.SelectControls = (() => {
  'use strict';
  const controls = new Map();
  let observer, started = false, queued = false, serial = 0, active = null;
  const observed = {subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true};
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    node.dataset.scOwned = 'true';
    return node;
  };
  const labelText = node => node.querySelector(':scope > span:not(.sc-control), :scope > label')?.textContent?.trim() ||
    [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join(' ').trim();
  const label = select => select.getAttribute('aria-label') ||
    (select.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
    [...(select.labels || [])].map(labelText).join(' ').trim() ||
    select.closest('.field')?.querySelector(':scope > span, :scope > label')?.textContent?.trim() ||
    select.name || '选择选项';
  const placeholder = select => select.dataset.placeholder || select.getAttribute('placeholder') ||
    [...select.options].find(option => option.value === '')?.textContent || '请选择';
  const unavailable = option => option.disabled || option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled;
  const isVisible = control => control.select.isConnected && !control.hidden &&
    control.wrap.getClientRects().length > 0 && getComputedStyle(control.wrap).visibility !== 'hidden';
  function quiet(fn) {
    if (observer) {
      observer.disconnect();
    }
    try { return fn(); }
    finally { if (observer && started) observer.observe(document.body, observed); }
  }
  function enhance(select) {
    if (controls.has(select) || select.dataset.selectNative === 'true') return;
    const wrap = make('span', 'sc-control');
    const button = make('button', 'sc-trigger');
    const value = make('span', 'sc-value');
    const arrow = make('span', 'sc-arrow', '⌄');
    const hint = make('small', 'sc-hint');
    arrow.setAttribute('aria-hidden', 'true');
    button.type = 'button';
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.append(value, arrow);
    const control = {select, wrap, button, value, hint, hidden: select.hidden, id: `sc-list-${++serial}`};
    controls.set(select, control);
    select.before(wrap);
    wrap.append(select, button, hint);
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    select.classList.add('sc-native');
    button.addEventListener('click', () => active?.control === control ? close() : open(control));
    button.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (active?.control !== control) open(control, event.key === 'ArrowUp' ? -1 : 1);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') move(event.key === 'ArrowDown' ? 1 : -1);
      else chooseActive();
    });
    select.addEventListener('change', () => refresh(select));
  }
  function sync(control) {
    const {select, button, value, wrap, hint} = control;
    // Native UI is hidden by CSS; the hidden property stays available to business rules.
    control.hidden = select.hidden;
    wrap.hidden = select.hidden;
    if (select.style.width) wrap.style.width = select.style.width;
    else wrap.style.removeProperty('width');
    const selected = [...select.selectedOptions].filter(option => option.value !== '');
    value.textContent = selected.length ? selected.slice(0, 2).map(option => option.textContent).join('、') +
      (selected.length > 2 ? ` 等 ${selected.length} 项` : '') : placeholder(select);
    value.classList.toggle('sc-placeholder', !selected.length);
    button.disabled = select.disabled;
    button.setAttribute('aria-label', label(select));
    button.setAttribute('aria-required', String(select.required));
    button.setAttribute('aria-expanded', String(active?.control === control));
    button.title = select.disabled && select.dataset.emptyHint ? select.dataset.emptyHint : selected.map(option => option.textContent).join('、');
    hint.textContent = select.disabled ? select.dataset.emptyHint || '' : '';
    hint.hidden = !hint.textContent;
    if (hint.textContent) {
      hint.id = `${control.id}-hint`;
      button.setAttribute('aria-describedby', hint.id);
    } else button.removeAttribute('aria-describedby');
  }
  function refresh(root = document) {
    quiet(() => {
      if (root.matches?.('select')) enhance(root);
      root.querySelectorAll?.('select').forEach(enhance);
      for (const [select, control] of controls) {
        if (!select.isConnected) {
          if (active?.control === control) close(false);
          control.wrap.remove();
          controls.delete(select);
          continue;
        }
        sync(control);
      }
      if (active) {
        if (!isVisible(active.control) || active.control.select.disabled) close(false);
        else { renderOptions(); position(); }
      }
    });
  }
  function close(focus = true) {
    if (!active) return;
    const {control, popup} = active;
    active = null;
    popup.remove();
    control.button.setAttribute('aria-expanded', 'false');
    control.button.removeAttribute('aria-activedescendant');
    control.button.removeAttribute('aria-controls');
    if (focus && isVisible(control) && !control.button.disabled) control.button.focus();
  }
  function open(control, direction = 1) {
    if (control.select.disabled || !isVisible(control)) return;
    close(false);
    const popup = make('div', 'sc-popup');
    const search = make('input', 'sc-search');
    search.type = 'search';
    search.placeholder = '搜索选项';
    search.autocomplete = 'off';
    search.setAttribute('aria-label', `${label(control.select)}：搜索选项`);
    const list = make('div', 'sc-options');
    list.id = control.id;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label(control.select));
    if (control.select.multiple) list.setAttribute('aria-multiselectable', 'true');
    popup.append(search, list);
    const footer = make('div', 'sc-footer');
    const clear = make('button', 'sc-action', '清空');
    clear.type = 'button';
    clear.addEventListener('click', () => {
      const select = control.select;
      [...select.options].forEach(option => { option.selected = !select.multiple && option.value === ''; });
      if (!select.multiple) close();
      select.dispatchEvent(new Event('change', {bubbles: true}));
      if (active) refresh(select);
    });
    if (control.select.multiple || !control.select.required && [...control.select.options].some(option => option.value === '' && !unavailable(option))) footer.append(clear);
    const done = make('button', 'sc-action sc-done', '完成');
    done.type = 'button';
    done.addEventListener('click', () => close());
    if (control.select.multiple) footer.append(done);
    if (footer.childElementCount) popup.append(footer);
    document.body.append(popup);
    active = {control, popup, list, search, index: -1, options: [], query: ''};
    control.button.setAttribute('aria-expanded', 'true');
    control.button.setAttribute('aria-controls', list.id);
    search.hidden = control.select.options.length < 8;
    search.addEventListener('input', () => {
      if (!active) return;
      active.query = search.value;
      active.index = -1;
      renderOptions();
      move(1);
      position();
    });
    search.addEventListener('keydown', event => {
      if (!active || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Enter') chooseActive();
      else move(event.key === 'ArrowDown' ? 1 : -1);
    });
    renderOptions();
    const preferred = active.options.findIndex(item => item.option.selected && !unavailable(item.option));
    active.index = preferred >= 0 ? preferred : direction > 0 ? -1 : active.options.length;
    if (preferred < 0) move(direction); else markActive();
    position();
    control.button.focus();
  }
  function renderOptions() {
    if (!active) return;
    const {control, list, query} = active;
    const oldOption = active.options[active.index]?.option;
    const options = [...control.select.options].filter(option => (!control.select.multiple || option.value !== '') && !option.hidden &&
      !(option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.hidden) &&
      option.textContent.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
    list.replaceChildren();
    active.options = options.map((option, index) => {
      const item = make('div', 'sc-option');
      item.id = `${control.id}-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.setAttribute('aria-disabled', String(!!unavailable(option)));
      const check = make('span', 'sc-check', option.selected ? '✓' : '');
      check.setAttribute('aria-hidden', 'true');
      const text = make('span', 'sc-option-text', option.textContent);
      item.append(check, text);
      item.addEventListener('mousedown', event => event.preventDefault());
      item.addEventListener('click', () => choose(option));
      list.append(item);
      return {option, item};
    });
    if (!options.length) list.append(make('div', 'sc-empty', control.select.dataset.emptyHint || (query ? '没有匹配的选项' : '暂无可选项')));
    active.index = active.options.findIndex(item => item.option === oldOption && !unavailable(item.option));
    markActive();
  }
  function markActive() {
    if (!active) return;
    active.options.forEach(({item}, index) => item.classList.toggle('sc-active', index === active.index));
    const item = active.options[active.index]?.item;
    if (item) {
      active.control.button.setAttribute('aria-activedescendant', item.id);
      active.search.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({block: 'nearest'});
    } else {
      active.control.button.removeAttribute('aria-activedescendant');
      active.search.removeAttribute('aria-activedescendant');
    }
  }
  function move(direction) {
    if (!active?.options.length) return;
    let index = active.index;
    for (let step = 0; step < active.options.length; step++) {
      index = (index + direction + active.options.length) % active.options.length;
      if (!unavailable(active.options[index].option)) { active.index = index; markActive(); return; }
    }
  }
  function chooseActive() { if (active?.options[active.index]) choose(active.options[active.index].option); }
  function choose(option) {
    if (!active || unavailable(option)) return;
    const {control} = active;
    const select = control.select;
    if (select.multiple) option.selected = !option.selected;
    else { select.selectedIndex = option.index; close(); }
    select.dispatchEvent(new Event('change', {bubbles: true}));
    if (select.isConnected) refresh(select);
  }
  function position() {
    if (!active) return;
    if (!isVisible(active.control)) { close(false); return; }
    const rect = active.control.button.getBoundingClientRect();
    const {popup} = active;
    const width = Math.min(Math.max(rect.width, 230), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < 250 && above > below;
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${Math.max(80, Math.min(390, upwards ? above : below))}px`;
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    popup.style.top = `${Math.max(8, upwards ? rect.top - popup.getBoundingClientRect().height - 5 : rect.bottom + 5)}px`;
  }
  function init() {
    if (started) { refresh(); return; }
    started = true;
    // Initial enhancement happens before observation, avoiding our own mutations.
    refresh();
    observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target?.dataset?.scOwned === 'true' && !record.addedNodes?.length && !record.removedNodes?.length) return false;
        if (target?.closest?.('.sc-popup')) return false;
        if (record.type === 'childList') return [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && (node.matches('select,option,optgroup') || node.querySelector('select,option,optgroup'))) || target?.matches?.('select,option,optgroup');
        return target?.matches?.('select,option,optgroup') || target?.closest?.('select') ||
          ['hidden', 'style', 'class'].includes(record.attributeName) && target?.querySelector?.('select');
      });
      if (!relevant || queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; refresh(); });
    });
    observer.observe(document.body, observed);
    document.addEventListener('pointerdown', event => {
      if (active && !active.popup.contains(event.target) && !active.control.wrap.contains(event.target)) close(false);
    }, true);
    window.addEventListener('keydown', event => {
      if (!active) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      else if (event.key === 'Tab') close();
    }, true);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', event => { if (active && !active.popup.contains(event.target)) position(); }, true);
    document.addEventListener('reset', () => queueMicrotask(() => refresh()));
  }
  return {init, refresh, close};
})();
