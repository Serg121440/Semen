// Имитация Google Sheets + Ozon API для прогона Code.gs в Node.
// Запуск: node ozon_fbo/tests/harness.test.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }

class Sheet {
  constructor(name) { this.name = name; this.cells = {}; this.bg = {}; this.hidden = new Set(); this.maxRows = 1000; this.maxCols = 200; this.merges = []; }
  getName() { return this.name; }
  key(r, c) { return r + ',' + c; }
  get(r, c) { const v = this.cells[this.key(r, c)]; return v === undefined ? '' : v; }
  set(r, c, v) { if (v === '' || v === null || v === undefined) delete this.cells[this.key(r, c)]; else this.cells[this.key(r, c)] = v; }
  getBg(r, c) { return this.bg[this.key(r, c)] || '#ffffff'; }
  getLastRow() { let m = 0; for (const k of Object.keys(this.cells)) m = Math.max(m, +k.split(',')[0]); return m; }
  getLastColumn() { let m = 0; for (const k of Object.keys(this.cells)) m = Math.max(m, +k.split(',')[1]); return m; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
      const c1 = colToNum(m[1]), r1 = m[2] ? +m[2] : 1;
      const c2 = m[3] ? colToNum(m[3]) : c1;
      const r2 = m[4] ? +m[4] : (m[3] ? this.maxRows : r1);
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new Range(this, a, b, c || 1, d || 1);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  clear() { this.cells = {}; this.bg = {}; this.merges = []; }
  clearContents() { this.cells = {}; }
  showRows(r, n) { for (let i = r; i < r + n; i++) this.hidden.delete(i); }
  hideRows(r, n) { this.hideCalls = (this.hideCalls || 0) + 1; for (let i = r; i < r + (n || 1); i++) this.hidden.add(i); }
  insertRowsAfter(_, n) { this.maxRows += n; }
  insertColumnsAfter(_, n) { this.maxCols += n; }
  deleteRows(r, n) {
    const cells = {};
    for (const [k, v] of Object.entries(this.cells)) { const [rr, cc] = k.split(',').map(Number); if (rr < r) cells[k] = v; else if (rr >= r + n) cells[(rr - n) + ',' + cc] = v; }
    this.cells = cells;
  }
  getFilter() { return null; }
  hideSheet() {} activate() {} setFrozenRows() {} setFrozenColumns() {} setColumnWidth() {} setRowHeight() {} setRowHeights() {} clearConditionalFormatRules() {}
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, i) => this.set(r, i + 1, v)); }
}

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  map(fn) { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(fn(this.r + i, this.c + j)); out.push(row); } return out; }
  getValues() { return this.map((r, c) => this.sh.get(r, c)); }
  getDisplayValues() { return this.map((r, c) => String(this.sh.get(r, c))); }
  getDisplayValue() { return String(this.sh.get(this.r, this.c)); }
  getValue() { return this.sh.get(this.r, this.c); }
  getBackgrounds() { return this.map((r, c) => this.sh.getBg(r, c)); }
  setValues(v) { assert.strictEqual(v.length, this.nr, 'rows ' + this.sh.name); v.forEach((row, i) => { assert.strictEqual(row.length, this.nc, 'cols'); row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x)); }); return this; }
  setValue(v) { this.sh.set(this.r, this.c, v); return this; }
  setBackground(col) { this.map((r, c) => { this.sh.bg[r + ',' + c] = col; }); return this; }
  setBackgrounds(v) { assert.strictEqual(v.length, this.nr); v.forEach((row, i) => row.forEach((x, j) => { this.sh.bg[(this.r + i) + ',' + (this.c + j)] = x; })); return this; }
  clearContent() { this.map((r, c) => this.sh.set(r, c, '')); return this; }
  getRow() { return this.r; } getColumn() { return this.c; }
  getLastRow() { return this.r + this.nr - 1; } getLastColumn() { return this.c + this.nc - 1; }
  getSheet() { return this.sh; }
  getA1Notation() { return String.fromCharCode(64 + this.c) + this.r; }
  merge() { this.sh.merges.push([this.r, this.c, this.nr, this.nc]); return this; }
  isPartOfMerge() { return this.sh.merges.some(([r, c, nr, nc]) => this.r >= r && this.r < r + nr && this.c >= c && this.c < c + nc); }
  breakApart() { return this; }
}
for (const m of ['setNumberFormat', 'setFontWeight', 'setFontColor', 'setFontSize', 'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap', 'setBorder', 'setNote', 'clearDataValidations', 'setDataValidation']) {
  Range.prototype[m] = function () { return this; };
}

function makeEnv(api) {
  const sheets = {};
  const alerts = [];
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n)),
    deleteSheet: s => { delete sheets[s.name]; },
    getSheets: () => Object.values(sheets),
  };
  const ui = { alert: (...a) => { alerts.push(a.join(' | ')); return 'YES'; }, Button: { YES: 'YES' }, ButtonSet: { YES_NO: 1 }, createMenu: () => ({}) };
  const calls = [];
  const ctx = {
    console,
    SpreadsheetApp: {
      getActive: () => ss, getUi: () => ui,
      newDataValidation: () => { const b = { requireValueInRange: () => b, setAllowInvalid: () => b, build: () => ({}) }; return b; },
      BorderStyle: {},
    },
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    Utilities: {
      sleep: () => {},
      formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : d.toISOString(),
    },
    UrlFetchApp: {
      fetch: (url, opt) => {
        const path = url.replace('https://api-seller.ozon.ru', '');
        const body = JSON.parse(opt.payload);
        calls.push(path);
        const res = api(path, body);
        const code = res && res.__code ? res.__code : 200;
        return { getResponseCode: () => code, getContentText: () => JSON.stringify(res) };
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
  const resetRun = () => vm.runInContext('CREDENTIALS_CACHE = null; Object.keys(CLUSTER_LIST_CACHE).forEach(k => delete CLUSTER_LIST_CACHE[k]); Object.keys(POSTINGS_CACHE).forEach(k => delete POSTINGS_CACHE[k]);', ctx);
  for (const fn of ['createTables', 'updateEverything', 'collectSupplyPlan', 'resetManualPlan', 'onEdit']) {
    const orig = ctx[fn];
    ctx[fn] = (...a) => { resetRun(); return orig(...a); };
  }
  return { ctx, sheets, alerts, calls };
}

// ---------- Имитация Ozon ----------
const CLUSTERS = {
  clusters: [
    { id: 1, name: 'Москва, МО и Дальние регионы', logistic_clusters: [{ warehouses: [{ warehouse_id: 101, name: 'ХОРУГВИНО_РФЦ' }] }] },
    { id: 2, name: 'Санкт-Петербург и СЗО', logistic_clusters: [{ warehouses: [{ warehouse_id: 201, name: 'СПБ_БУГРЫ_РФЦ' }] }] },
    { id: 3, name: 'Ярославль', logistic_clusters: [{ warehouses: [{ warehouse_id: 301, name: 'ЯРОСЛАВЛЬ' }] }] },
    { id: 4, name: 'Смоленск', logistic_clusters: [{ warehouses: [{ warehouse_id: 401, name: 'СМОЛЕНСК_2' }] }] },
  ],
};
let SALES_SCENARIO = 1;
function api(path, body) {
  switch (path) {
    case '/v3/product/list':
      return { result: { items: [{ offer_id: 'ФА-01', product_id: 11 }, { offer_id: 'RASK-1', product_id: 12 }, { offer_id: 'X-1', product_id: 13 }], last_id: '' } };
    case '/v4/product/info/stocks':
      return { items: [{ offer_id: 'ФА-01', stocks: [{ type: 'fbo', present: 5 }] }, { offer_id: 'X-1', stocks: [{ type: 'fbo', present: 0 }, { type: 'fbs', present: 100 }] }] };
    case '/v1/cluster/list':
      return CLUSTERS;
    case '/v3/posting/fbo/list': {
      const postings = SALES_SCENARIO === 1 ? [
        { status: 'delivered', analytics_data: { warehouse_id: 101 }, products: [{ offer_id: 'X-1', quantity: 30, name: 'Товар X' }] },
        { status: 'delivered', analytics_data: { warehouse_id: 201 }, products: [{ offer_id: 'ФА-01', quantity: 10, name: 'Фотоальбом' }] },
        { status: 'cancelled', analytics_data: { warehouse_id: 101 }, products: [{ offer_id: 'X-1', quantity: 99 }] },
      ] : [
        { status: 'delivered', analytics_data: { warehouse_id: 101 }, products: [{ offer_id: 'ФА-01', quantity: 3, name: 'Фотоальбом' }] },
      ];
      return { postings, has_next: false, cursor: '' };
    }
    case '/v2/analytics/stock_on_warehouses':
      return { result: { rows: [
        { item_code: 'X-1', warehouse_name: 'ХОРУГВИНО_РФЦ', free_to_sell_amount: 6, item_name: 'Товар X' },
        { item_code: 'RASK-1', warehouse_name: 'Смоленск_2', free_to_sell_amount: 4, item_name: 'Раскраска для детей' },
        { item_code: 'ФА-01', warehouse_name: 'СПБ_ШУШАРЫ', free_to_sell_amount: 5 },
      ] } };
    case '/v3/supply-order/list':
      // Ozon всегда возвращает last_id — раньше это давало бесконечный цикл.
      return body.last_id ? { order_ids: [], last_id: 'L1' } : { order_ids: [555], last_id: 'L1' };
    case '/v3/supply-order/get':
      return { orders: [{ order_id: 555, order_number: 'N-555', supplies: [{ bundle_id: 'b1', macrolocal_cluster_id: 1, state: 'IN_TRANSIT' }] }] };
    case '/v1/supply-order/bundle':
      return { items: [{ offer_id: 'X-1', quantity: 4 }], has_next: false };
    default:
      throw new Error('unexpected ' + path);
  }
}

// ---------- Сценарий ----------
const { ctx, sheets, alerts, calls } = makeEnv(api);
ctx.createTables();
const main = sheets['Поставка FBO'];
alerts.length = 0; main.set(2, 2, 'client'); main.set(3, 2, 'key'); main.set(5, 2, 30); main.set(6, 2, 45); main.set(7, 2, 1);
ctx.createTables();
console.log('alerts:', alerts.slice(-1)[0]);
assert(!/Ошибка/.test(alerts.join('\n')), alerts.join('\n'));

function mainRow(offer) {
  for (let r = 9; r <= main.getLastRow(); r++) if (main.get(r, 1) === offer) return r;
  throw new Error('no row ' + offer);
}
let r = mainRow('X-1');
// X-1: продажи 30 за 30 дней, остаток 0 (FBS не считается), в пути 4, цель 45 дней → 45 − 4 = 41.
assert.strictEqual(main.get(r, 5), 30);
assert.strictEqual(main.get(r, 4), 0);
assert.strictEqual(main.get(r, 7), 4);
assert.strictEqual(main.get(r, 8), 41);
assert.strictEqual(main.get(r, 9), 41);
assert.strictEqual(main.get(r, 2), 'Товар X', 'название из отправлений');
// ФА-01: продажи 10, остаток 5, цель 45 → 15 − 5 = 10 → коробка 16.
r = mainRow('ФА-01');
assert.strictEqual(main.get(r, 8), 16);
// Название раскраски пришло из отчёта об остатках.
assert.strictEqual(main.get(mainRow('RASK-1'), 2), 'Раскраска для детей');

// Кластерная таблица
const cs = sheets['Продажи по кластерам'];
const header = []; for (let c = 1; c <= cs.getLastColumn(); c++) header.push(cs.get(3, c));
const colOf = name => header.indexOf(name) + 1;
function csRow(offer) { for (let rr = 5; rr <= cs.getLastRow(); rr++) if (cs.get(rr, 1) === offer) return rr; throw new Error('no cs row ' + offer); }
const mosc = colOf('Москва, МО и Дальние регионы');
const smol = colOf('Смоленск');
const spb = colOf('Санкт-Петербург и СЗО');
let xr = csRow('X-1');
assert.deepStrictEqual([cs.get(xr, mosc), cs.get(xr, mosc + 1), cs.get(xr, mosc + 2)], [30, 6, 4]);
// План: 30/30*45 − 6 − 4 = 35
assert.strictEqual(cs.get(xr, mosc + 4), 35);
// Смоленск больше не уходит в Москву.
assert.strictEqual(cs.get(csRow('RASK-1'), smol + 1), 4);
assert.strictEqual(cs.get(csRow('RASK-1'), mosc + 1), 0);
// Шушары → СПб по алиасу
assert.strictEqual(cs.get(csRow('ФА-01'), spb + 1), 5);

// ---------- Ручные правки ----------
r = mainRow('X-1');
main.set(r, 9, 7);
ctx.onEdit({ range: main.getRange(r, 9) });
assert.strictEqual(main.getBg(r, 9), '#f9cb9c');
cs.set(xr, mosc + 4, 12);
ctx.onEdit({ range: cs.getRange(xr, mosc + 4) });
assert.strictEqual(cs.getBg(xr, mosc + 4), '#f9cb9c');

// Обновление с другими продажами: X-1 больше не продаётся.
SALES_SCENARIO = 2;
ctx.updateEverything();
assert(!/Ошибка/.test(alerts.join('\n')), alerts.join('\n'));
r = mainRow('X-1');
assert.strictEqual(main.get(r, 9), 7, 'ручное «Поставить» сохранилось');
assert.strictEqual(main.getBg(r, 9), '#f9cb9c');
assert.strictEqual(main.get(r, 8), 0, 'рекомендация пересчитана');
xr = csRow('X-1');
assert.strictEqual(cs.get(xr, mosc + 4), 12, 'ручной «План» сохранился');
assert.strictEqual(cs.get(xr, mosc), 0, 'старые продажи не переносятся');
assert.strictEqual(main.get(r, 2), 'Товар X', 'название сохранилось между загрузками');

// Очистка ячейки возвращает авторасчёт
main.set(r, 9, '');
ctx.onEdit({ range: main.getRange(r, 9) });
assert.strictEqual(main.get(r, 9), 0);
assert.strictEqual(main.getBg(r, 9), '#fff2cc');

// Сборка плана включает ручное значение
ctx.collectSupplyPlan();
const plan = sheets['План поставок'];
const planCells = JSON.stringify(plan.cells);
assert(planCells.includes('"X-1"'), planCells);

// Сброс ручных правок
ctx.resetManualPlan();
assert.strictEqual(cs.getBg(csRow('X-1'), mosc + 4), '#fff2cc');
assert.strictEqual(cs.get(csRow('X-1'), mosc + 4), 0);

// Фильтр товара: скрытие диапазонами
cs.set(1, 2, 'X-1');
ctx.onEdit({ range: cs.getRange('B1'), value: 'X-1' });
assert(cs.hideCalls <= 2, 'hideRows calls ' + cs.hideCalls);

// Лог без записей о каждом HTTP-запросе
const log = sheets['Лог'];
const ops = []; for (let rr = 2; rr <= log.getLastRow(); rr++) ops.push(log.get(rr, 2));
assert(!ops.includes('HTTP запрос'));
// Отправления грузятся один раз за запуск: 2 запуска → 2 запроса
assert.strictEqual(calls.filter(p => p === '/v3/posting/fbo/list').length, 2);

// ---------- Сопоставление складов ----------
const cl = CLUSTERS.clusters.map(c => c.name).concat(['Ростов', 'Дальний Восток', 'Екатеринбург']);
const m = w => ctx.matchWarehouseToCluster_(w, cl);
assert.strictEqual(m('СМОЛЕНСК_2'), 'Смоленск');
assert.strictEqual(m('Ростов Великий'), 'Ярославль');
assert.strictEqual(m('РОСТОВ_НА_ДОНУ_РФЦ'), 'Ростов');
assert.strictEqual(m('Артёмовский'), '');
assert.strictEqual(m('АРТЕМ_РФЦ'), 'Дальний Восток');
assert.strictEqual(m('ХОРУГВИНО_РФЦ'), 'Москва, МО и Дальние регионы');
assert.strictEqual(m('Екатеринбург_РФЦ_НОВЫЙ'), 'Екатеринбург');
assert.strictEqual(m('Санкт-Петербург и СЗО'), 'Санкт-Петербург и СЗО');

// 429 → повтор
let hit = 0;
const env2 = makeEnv((p) => (++hit === 1 ? { __code: 429, message: 'rate' } : { result: { items: [] } }));
env2.sheets['Поставка FBO'] = new Sheet('Поставка FBO');
env2.sheets['Поставка FBO'].set(2, 2, 'c'); env2.sheets['Поставка FBO'].set(3, 2, 'k');
const res = env2.ctx.ozonRequest_('/v3/product/list', {}, 'k');
assert.strictEqual(JSON.stringify(res), '{"result":{"items":[]}}'); assert.strictEqual(hit, 2);

// Дневник давления: минимум 20, кратно 20
assert.strictEqual(ctx.roundSupplyQuantity_(1, 'DD-1', 'Дневник давления'), 20);
assert.strictEqual(ctx.roundSupplyQuantity_(21, 'DD-1', 'Дневник давления'), 40);
assert.strictEqual(ctx.roundSupplyQuantity_(0, 'DD-1', 'Дневник давления'), 0);

console.log('ALL TESTS PASSED');
