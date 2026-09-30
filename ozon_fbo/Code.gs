/**
 * OZON FBO — версия 2.4.0
 *
 * B2 — Client-Id
 * B3 — основной Seller API-ключ
 * B5 — период продаж, дней
 * B6 — целевой запас, дней
 * B7 — коэффициент продаж
 *
 * Метод /v3/product/info/list не используется. Названия товаров берутся
 * из отправлений и отчёта об остатках на складах.
 *
 * Ручные правки в «Поставить» (лист «Поставка FBO») и в «План»
 * (лист «Продажи по кластерам») сохраняются при обновлении.
 * Такие ячейки подсвечены оранжевым. Чтобы вернуть автоматический
 * расчёт, очистите ячейку или выберите «Сбросить ручные правки».
 */

const APP_VERSION = '2.4.0';

let BATCH_MODE = false;
let BATCH_ERROR = null;
let BUILD_MODE = false;

// Кэши живут только в пределах одного запуска скрипта.
let CREDENTIALS_CACHE = null;
const CLUSTER_LIST_CACHE = {};
const POSTINGS_CACHE = {};

const OZON = {
  SHEET: 'Поставка FBO',
  LOG_SHEET: 'Лог',
  CLUSTER_SALES_SHEET: 'Продажи по кластерам',
  CLUSTER_STOCKS_SHEET: 'Остатки по кластерам',
  TRANSIT_SHEET: 'Поставки в пути',
  PLAN_SHEET: 'План поставок',
  DATA_START_ROW: 9,
  CLIENT_ID_CELL: 'B2',
  MAIN_KEY_CELL: 'B3',
  SALES_DAYS_CELL: 'B5',
  STOCK_DAYS_CELL: 'B6',
  SALES_COEFFICIENT_CELL: 'B7',
  BASE_URL: 'https://api-seller.ozon.ru',
  PUT_COLUMN: 9,
  CLUSTER_DATA_START_ROW: 5,
  AUTO_PLAN_COLOR: '#fff2cc',
  MANUAL_PLAN_COLOR: '#f9cb9c',
  LOG_MAX_ROWS: 3000
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Ozon FBO')
    .addItem('1. Создать таблицы', 'createTables')
    .addItem('2. Обновить данные', 'updateEverything')
    .addItem('3. Собрать план поставок', 'collectSupplyPlan')
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu('Сервис')
        .addItem('Сбросить ручные правки плана', 'resetManualPlan')
        .addItem('Проверить API-ключ', 'checkApiKeys')
        .addItem('Последняя запись лога', 'showLastLog')
        .addItem('Версия скрипта', 'showVersion')
    )
    .addToUi();
}

function createTables() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Создать таблицы заново?',
    'Рабочие листы и оформление будут пересозданы. Client-Id и API-ключ сохранятся.',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActive();
  let main = ss.getSheetByName(OZON.SHEET);

  const savedClientId = main
    ? String(main.getRange(OZON.CLIENT_ID_CELL).getDisplayValue()).trim()
    : '';
  const savedApiKey = main
    ? String(main.getRange(OZON.MAIN_KEY_CELL).getDisplayValue()).trim()
    : '';
  const savedSalesDays = main
    ? Number(main.getRange(OZON.SALES_DAYS_CELL).getValue()) || 30
    : 30;
  const savedStockDays = main
    ? Number(main.getRange(OZON.STOCK_DAYS_CELL).getValue()) || 30
    : 30;
  const savedCoefficient = main
    ? Number(main.getRange(OZON.SALES_COEFFICIENT_CELL).getValue()) || 1
    : 1;

  if (!main) main = ss.insertSheet(OZON.SHEET);

  setupMainSheet_(
    main,
    savedClientId,
    savedApiKey,
    savedSalesDays,
    savedStockDays,
    savedCoefficient
  );

  [
    OZON.CLUSTER_SALES_SHEET,
    OZON.TRANSIT_SHEET,
    OZON.PLAN_SHEET,
    '_Справочник товаров',
    'FBO_API_TEST'
  ].forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (sheet && name !== OZON.CLUSTER_SALES_SHEET && name !== OZON.TRANSIT_SHEET) {
      ss.deleteSheet(sheet);
    }
  });

  const clusterSheet = ss.getSheetByName(OZON.CLUSTER_SALES_SHEET);
  if (clusterSheet) clusterSheet.clear();

  const transitSheet = ss.getSheetByName(OZON.TRANSIT_SHEET);
  if (transitSheet) transitSheet.clear();

  clearB1ValidationsEverywhere_();

  BUILD_MODE = true;
  try {
    ensureTransitSheet_();
    refreshEverything();
    rebuildProductSelectorFromSheet_('');
  } finally {
    BUILD_MODE = false;
  }
}

function setupMainSheet_(sh, clientId, apiKey, salesDays, stockDays, coefficient) {
  sh.getDataRange().breakApart();
  sh.clear();

  sh.getRange('A1:I1').breakApart();
  sh.getRange('A1:I1')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff');

  sh.getRange('A1')
    .setValue('Ozon FBO — планирование поставок')
    .setFontSize(16)
    .setFontWeight('bold')
    .setHorizontalAlignment('left');

  sh.getRange('A2:B7').setValues([
    ['Client-Id', clientId],
    ['API-ключ', apiKey],
    ['', ''],
    ['Продажи за, дней', Math.max(1, Number(salesDays) || 30)],
    ['Целевой запас, дней', Math.max(1, Number(stockDays) || 30)],
    ['Коэффициент продаж', Math.max(0, Number(coefficient) || 1)]
  ]);

  sh.getRange('A2:A7')
    .setFontWeight('bold')
    .setBackground('#d9eaf7');

  sh.getRange('B2:B7').setBackground('#fff2cc');
  sh.getRange('B5:B6').setNumberFormat('0');
  sh.getRange('B7').setNumberFormat('0.00');

  sh.getRange('A8:I8').setValues([[
    'Артикул',
    'Название',
    'Product ID',
    'Остаток FBO',
    'Продажи',
    'Средние продажи/день',
    'В пути',
    'Рекомендуемая поставка',
    'Поставить'
  ]]);

  sh.getRange('A8:I8')
    .setFontWeight('bold')
    .setBackground('#1f4e78')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center')
    .setWrap(true);

  sh.setFrozenRows(8);
  sh.setFrozenColumns(1);

  const widths = [180, 330, 130, 105, 90, 125, 90, 145, 100];
  widths.forEach(function(width, index) {
    sh.setColumnWidth(index + 1, width);
  });

  sh.getRange('A2:B7').setBorder(true, true, true, true, true, true);
  sh.getRange('A8:I8').setBorder(true, true, true, true, true, true);
  sh.getRange('I9:I').setBackground(OZON.AUTO_PLAN_COLOR);
  sh.getRange('G9:G').setBackground('#d9eaf7');

  sh.getRange('B5').setNote('Берутся последние полные дни. Сегодняшний день не учитывается.');
  sh.getRange('B6').setNote(
    'На сколько дней продаж должно хватить остатка вместе с товаром в пути.\n' +
    'Рекомендация = продажи в день × B6 − остаток − в пути.'
  );
  sh.getRange('B7').setNote(
    'Продажи за выбранный период умножаются на этот коэффициент ' +
    '(например, 1.2 — ожидаем рост на 20%).'
  );
  sh.getRange('I8').setNote(
    'Можно править вручную: ручное значение подсвечивается оранжевым ' +
    'и сохраняется при обновлении. Очистите ячейку, чтобы вернуть авторасчёт.'
  );
}

function updateEverything() {
  const ss = SpreadsheetApp.getActive();
  const obsoleteTestSheet = ss.getSheetByName('FBO_API_TEST');
  if (obsoleteTestSheet) ss.deleteSheet(obsoleteTestSheet);
  const clusterSheet = ss.getSheetByName(OZON.CLUSTER_SALES_SHEET);
  if (!clusterSheet || clusterSheet.getRange('A3').getDisplayValue() !== 'Артикул') {
    SpreadsheetApp.getUi().alert('Сначала нажмите «1. Создать таблицы».');
    return;
  }

  // Сохраняем выбранный товар, затем временно снимаем ВСЕ проверки B1.
  // Обновление данных проходит без единой проверки в B1, поэтому конфликт невозможен.
  const selectedProduct = String(clusterSheet.getRange('B1').getDisplayValue() || '');
  clearB1ValidationsEverywhere_();

  BUILD_MODE = false;
  try {
    ensureTransitSheet_();
    refreshEverything();
    rebuildProductSelectorFromSheet_(selectedProduct);
  } catch (error) {
    // Даже при ошибке возвращаем фильтр, чтобы таблица оставалась рабочей.
    try { rebuildProductSelectorFromSheet_(selectedProduct); } catch (ignored) {}
    throw error;
  }
}

function clearB1ValidationsEverywhere_() {
  SpreadsheetApp.getActive().getSheets().forEach(function(sheet) {
    try {
      sheet.getRange('B1').clearDataValidations();
    } catch (ignored) {}
  });
}

function rebuildProductSelectorFromSheet_(selectedProduct) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(OZON.CLUSTER_SALES_SHEET);
  if (!sh) return;

  const helperName = '_Справочник товаров';
  let helper = ss.getSheetByName(helperName);
  if (!helper) helper = ss.insertSheet(helperName);
  helper.clearContents();

  const lastRow = sh.getLastRow();
  const labels = [];
  if (lastRow >= 5) {
    const rows = sh.getRange(5, 1, lastRow - 4, 2).getDisplayValues();
    rows.forEach(function(row) {
      const offerId = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      if (offerId) labels.push([offerId + (name ? ' — ' + name : '')]);
    });
  }

  if (labels.length) helper.getRange(1, 1, labels.length, 1).setValues(labels);

  const selectorCell = sh.getRange('B1');
  selectorCell.clearDataValidations();

  // Сначала возвращаем значение без проверки, затем накладываем правило.
  // Если выбранный товар исчез из каталога, просто очищаем фильтр.
  const allowed = labels.map(function(row) { return row[0]; });
  const selected = allowed.indexOf(selectedProduct) >= 0 ? selectedProduct : '';
  selectorCell.setValue(selected);
  selectorCell.setNote('Пустая ячейка показывает все товары.');

  if (labels.length) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(helper.getRange(1, 1, labels.length, 1), true)
      .setAllowInvalid(true)
      .build();
    selectorCell.setDataValidation(rule);
  }

  helper.hideSheet();
  applyProductSelector_(sh, selected);
}

/**
 * Одна основная команда:
 * 1) заполняет первую страницу;
 * 2) обновляет продажи и остатки;
 * 3) пересчитывает рекомендации;
 * 4) собирает кластерную таблицу с автопланом.
 */
function refreshEverything() {
  BATCH_MODE = true;
  BATCH_ERROR = null;

  try {
    runRefreshStep_(function() { loadProducts(true); });
    runRefreshStep_(function() { updateStocks(true); });
    runRefreshStep_(function() { updateSales(true); });

    const credentials = getCredentials_();
    const clusterResult = loadClusterList_(credentials.mainKey);
    const clusters = parseClusters_(clusterResult.response).clusterNames;
    if (!clusters.length) {
      throw new Error('Ozon не вернул список кластеров.');
    }

    runRefreshStep_(function() {
      refreshTransitSheetFromApi_(clusters, credentials.mainKey);
    });
    runRefreshStep_(function() { syncTransitToMainSheet_(); });
    runRefreshStep_(function() { calculateSupply(true); });

    // Старый метод updateClusterSales() полностью очищает лист и строит
    // промежуточную таблицу. Он нужен только при первоначальном создании.
    // При обычном обновлении сразу вызываем общую кластерную таблицу:
    // она сама заново получает продажи из API и меняет только строки данных.
    if (BUILD_MODE) {
      runRefreshStep_(function() { updateClusterSales(true); });
    }
    runRefreshStep_(function() { updateClusterStocks(true); });

    SpreadsheetApp.getUi().alert(
      (BUILD_MODE ? 'Готово. Таблицы созданы и заполнены.\n' : 'Готово. Данные обновлены без пересоздания таблиц.\n') +
      'План отгрузки заполнен автоматически, его можно исправлять вручную.\n' +
      'Время: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm')
    );
  } catch (error) {
    BATCH_MODE = false;
    BATCH_ERROR = null;
    handleError_('Обновить всё', error);
    return;
  }

  BATCH_MODE = false;
  BATCH_ERROR = null;
}

function runRefreshStep_(callback) {
  callback();
  if (BATCH_ERROR) {
    const error = BATCH_ERROR;
    BATCH_ERROR = null;
    throw error;
  }
}

function showVersion() {
  SpreadsheetApp.getUi().alert('Установлена версия: ' + APP_VERSION);
}

function getCredentials_() {
  if (CREDENTIALS_CACHE) return CREDENTIALS_CACHE;

  const sh = getMainSheet_();

  const clientId = String(
    sh.getRange(OZON.CLIENT_ID_CELL).getDisplayValue()
  ).trim();

  const mainKey = String(
    sh.getRange(OZON.MAIN_KEY_CELL).getDisplayValue()
  ).trim();

  if (!clientId) {
    throw new Error('Не заполнен Client-Id в B2.');
  }

  if (!mainKey) {
    throw new Error('Не заполнен основной API-ключ в B3.');
  }

  CREDENTIALS_CACHE = {
    clientId: clientId,
    mainKey: mainKey
  };
  return CREDENTIALS_CACHE;
}

/**
 * Настройки планирования с листа «Поставка FBO».
 * Продажи в таблицах уже умножены на коэффициент, поэтому здесь
 * коэффициент нужен только для подписи и загрузки продаж.
 */
function getPlanningSettings_(sh) {
  return {
    salesDays: Math.max(1, Number(sh.getRange(OZON.SALES_DAYS_CELL).getValue()) || 30),
    stockDays: Math.max(1, Number(sh.getRange(OZON.STOCK_DAYS_CELL).getValue()) || 30),
    coefficient: getSalesCoefficient_(sh)
  };
}

/**
 * Единый расчёт для основного листа и кластерной таблицы.
 * sales — продажи за период с учётом коэффициента.
 */
function computeSupplyPlan_(sales, stock, transit, settings, offerId, name) {
  const avgPerDay = Math.max(0, Number(sales) || 0) / settings.salesDays;
  const available = Math.max(0, Number(stock) || 0) + Math.max(0, Number(transit) || 0);
  const need = avgPerDay * settings.stockDays - available;

  return {
    avgPerDay: avgPerDay,
    daysStock: avgPerDay > 0 ? available / avgPerDay : (available > 0 ? 999 : 0),
    plan: roundSupplyQuantity_(need, offerId, name)
  };
}

/**
 * Проверка использует только /v3/product/list.
 */
function checkApiKeys() {
  try {
    const credentials = getCredentials_();

    const response = ozonRequest_(
      '/v3/product/list',
      {
        filter: {
          visibility: 'ALL'
        },
        last_id: '',
        limit: 1
      },
      credentials.mainKey
    );

    const result = response.result || {};
    const count = Array.isArray(result.items) ? result.items.length : 0;

    log_(
      'Проверка API',
      'OK',
      'Версия ' + APP_VERSION + '. API отвечает. Получено позиций: ' + count
    );

    SpreadsheetApp.getUi().alert(
      'API работает.\n' +
      'Версия скрипта: ' + APP_VERSION + '\n' +
      'Доступ к каталогу подтверждён.'
    );
  } catch (error) {
    handleError_('Проверка API', error);
  }
}

/**
 * Загружает каталог через /v3/product/list.
 * Не вызывает /v3/product/info/list вообще.
 *
 * Записывает:
 * A — offer_id;
 * B — название, если оно уже было известно по прошлым загрузкам;
 * C — product_id.
 *
 * Ручные значения в «Поставить» переносятся по offer_id.
 */
function loadProducts(silent) {
  try {
    const sh = getMainSheet_();
    const credentials = getCredentials_();
    const previous = readMainSheetState_(sh);

    const catalog = [];
    let lastId = '';
    let page = 0;

    do {
      page++;

      const response = ozonRequest_(
        '/v3/product/list',
        {
          filter: {
            visibility: 'ALL'
          },
          last_id: lastId,
          limit: 1000
        },
        credentials.mainKey
      );

      const result = response.result || {};
      const items = Array.isArray(result.items) ? result.items : [];

      items.forEach(function(item) {
        const offerId = String(item.offer_id || '').trim();
        const productId = String(item.product_id || item.id || '').trim();

        if (!offerId && !productId) {
          return;
        }

        catalog.push([
          offerId,
          previous.names[offerId] || '',
          productId
        ]);
      });

      const nextLastId = String(result.last_id || '').trim();

      if (
        items.length === 0 ||
        !nextLastId ||
        nextLastId === lastId
      ) {
        break;
      }

      lastId = nextLastId;
      Utilities.sleep(250);

      if (page >= 100) {
        throw new Error(
          'Остановлена загрузка после 100 страниц: защита от бесконечного цикла.'
        );
      }
    } while (true);

    if (catalog.length === 0) {
      throw new Error(
        'Ozon вернул пустой каталог. Проверьте кабинет и права ключа.'
      );
    }

    clearDataArea_(sh);

    sh.getRange(
      OZON.DATA_START_ROW,
      1,
      catalog.length,
      3
    ).setValues(catalog);

    restoreManualPutValues_(sh, catalog, previous.manualPut);
    applyCalculationFormulas_(sh, catalog.length);

    log_(
      'Загрузка каталога',
      'OK',
      'Версия ' + APP_VERSION + '. Загружено товаров: ' + catalog.length
    );

    if (!silent) {
      SpreadsheetApp.getUi().alert(
        'Каталог загружен: ' + catalog.length + ' товаров.\n' +
        'Версия: ' + APP_VERSION
      );
    }
  } catch (error) {
    handleError_('Загрузка каталога', error);
  }
}


/**
 * Обновляет общий доступный остаток FBO по каждому offer_id.
 *
 * Используется /v4/product/info/stocks.
 * Запросы идут пачками по 100 offer_id.
 * Парсер сделан защитно: учитывает несколько вариантов структуры ответа.
 */
function updateStocks(silent) {
  try {
    const sh = getMainSheet_();
    const credentials = getCredentials_();
    const lastRow = getLastProductRow_(sh);

    if (lastRow < OZON.DATA_START_ROW) {
      throw new Error('Сначала выполните «Загрузить каталог».');
    }

    const rowCount = lastRow - OZON.DATA_START_ROW + 1;

    const offerRows = sh.getRange(
      OZON.DATA_START_ROW,
      1,
      rowCount,
      1
    ).getDisplayValues();

    const offerIds = offerRows
      .map(function(row) {
        return String(row[0] || '').trim();
      })
      .filter(function(value) {
        return Boolean(value);
      });

    if (offerIds.length === 0) {
      throw new Error('В столбце A нет offer_id.');
    }

    const stocksByOffer = {};

    chunk_(offerIds, 100).forEach(function(batch) {
      const response = ozonRequest_(
        '/v4/product/info/stocks',
        {
          filter: {
            offer_id: batch,
            visibility: 'ALL'
          },
          limit: 1000
        },
        credentials.mainKey
      );

      const items = extractStockItems_(response);

      items.forEach(function(item) {
        const offerId = String(
          item.offer_id ||
          item.offerId ||
          (
            item.product &&
            item.product.offer_id
          ) ||
          ''
        ).trim();

        if (!offerId) {
          return;
        }

        stocksByOffer[offerId] = calculateFboStock_(item);
      });

      Utilities.sleep(250);
    });

    const values = offerRows.map(function(row) {
      const offerId = String(row[0] || '').trim();

      return [
        Object.prototype.hasOwnProperty.call(stocksByOffer, offerId)
          ? stocksByOffer[offerId]
          : 0
      ];
    });

    sh.getRange(
      OZON.DATA_START_ROW,
      4,
      values.length,
      1
    ).setValues(values);

    applyCalculationFormulas_(sh, rowCount);

    const matched = Object.keys(stocksByOffer).length;

    log_(
      'Обновление остатков FBO',
      'OK',
      'Обновлены остатки. Найдено offer_id в ответе: ' +
      matched +
      ' из ' +
      offerIds.length
    );

    if (!silent) {
      SpreadsheetApp.getUi().alert(
        'Остатки FBO обновлены.\n' +
        'Ozon вернул данные по ' + matched +
        ' из ' + offerIds.length + ' артикулов.'
      );
    }
  } catch (error) {
    handleError_('Обновление остатков FBO', error);
  }
}

function extractStockItems_(response) {
  if (!response || typeof response !== 'object') {
    return [];
  }

  if (Array.isArray(response.items)) {
    return response.items;
  }

  if (
    response.result &&
    Array.isArray(response.result.items)
  ) {
    return response.result.items;
  }

  if (Array.isArray(response.result)) {
    return response.result;
  }

  return [];
}

function calculateFboStock_(item) {
  let total = 0;

  const stocks = Array.isArray(item.stocks)
    ? item.stocks
    : (
        item.result &&
        Array.isArray(item.result.stocks)
          ? item.result.stocks
          : []
      );

  stocks.forEach(function(stock) {
    const type = String(
      stock.type ||
      stock.stock_type ||
      stock.stockType ||
      ''
    ).toLowerCase();

    // Если тип явно относится к FBS — не учитываем.
    if (
      type.indexOf('fbs') !== -1 ||
      type.indexOf('seller') !== -1
    ) {
      return;
    }

    // Для FBO обычно нужны present/valid_stock_count.
    const quantity = firstFiniteNumber_([
      stock.present,
      stock.valid_stock_count,
      stock.available,
      stock.quantity,
      stock.count
    ]);

    total += quantity;
  });

  // Защитный вариант для ответов без массива stocks.
  if (stocks.length === 0) {
    total = firstFiniteNumber_([
      item.present,
      item.valid_stock_count,
      item.available,
      item.quantity,
      item.count
    ]);
  }

  return Math.max(0, total);
}

function firstFiniteNumber_(values) {
  for (let index = 0; index < values.length; index++) {
    const value = Number(values[index]);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function chunk_(arr, size) {
  const result = [];

  for (let index = 0; index < arr.length; index += size) {
    result.push(arr.slice(index, index + size));
  }

  return result;
}



/**
 * Первичное построение листа «Продажи по кластерам» (только при создании таблиц).
 * Даёт updateClusterStocks() список кластеров в заголовке.
 * Кластер продажи определяется по analytics_data.warehouse_id.
 */
function updateClusterSales(silent) {
  try {
    const mainSheet = getMainSheet_();
    const credentials = getCredentials_();
    const lastRow = getLastProductRow_(mainSheet);

    if (lastRow < OZON.DATA_START_ROW) {
      throw new Error('Сначала выполните «Загрузить каталог».');
    }

    const rowCount = lastRow - OZON.DATA_START_ROW + 1;
    const catalogRows = mainSheet.getRange(
      OZON.DATA_START_ROW,
      1,
      rowCount,
      3
    ).getDisplayValues();

    const catalog = [];
    const knownOffers = {};

    catalogRows.forEach(function(row) {
      const offerId = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      const productId = String(row[2] || '').trim();

      if (!offerId) return;

      catalog.push({
        offerId: offerId,
        name: name,
        productId: productId
      });

      knownOffers[offerId] = true;
    });

    // 1. Получаем полный фиксированный список кластеров Ozon
    // и соответствие warehouse_id -> cluster_name.
    const clusterResult = loadClusterList_(credentials.mainKey);
    const clusterResponse = clusterResult.response;

    log_(
      'Тип кластеров Ozon',
      'INFO',
      'Принят cluster_type: ' + clusterResult.clusterType
    );

    const clusterInfo = parseClusters_(clusterResponse);
    const clusters = clusterInfo.clusterNames;
    const warehouseToCluster = clusterInfo.warehouseToCluster;

    if (clusters.length === 0) {
      throw new Error(
        'Метод /v1/cluster/list не вернул список кластеров. ' +
        'Полный ответ записан в лог.'
      );
    }

    log_(
      'Кластеры Ozon',
      'INFO',
      'Получено кластеров: ' + clusters.length +
      '; складов в сопоставлении: ' + Object.keys(warehouseToCluster).length +
      '; RAW=' + safeJson_(clusterResponse)
    );

    const days = Math.max(
      1,
      Number(mainSheet.getRange(OZON.SALES_DAYS_CELL).getValue()) || 30
    );

    const range = getCompletedSalesRange_(days);
    const dateFrom = range.dateFrom;
    const dateTo = range.dateTo;

    const salesByOffer = {};
    const unknownWarehouses = {};
    const postings = fetchFboPostings_(credentials.mainKey, dateFrom, dateTo);
    const postingCount = postings.length;

    postings.forEach(function(posting) {
      const analytics = posting.analytics_data || {};
      const warehouseId = String(analytics.warehouse_id || '').trim();
      const warehouseName = String(analytics.warehouse_name || '').trim();
      const clusterName = warehouseToCluster[warehouseId] || '';

      if (!clusterName) {
        const key = warehouseId || warehouseName || 'неизвестный склад';
        unknownWarehouses[key] = warehouseName || warehouseId;
        return;
      }

      const products = Array.isArray(posting.products)
        ? posting.products
        : [];

      products.forEach(function(product) {
        const offerId = String(product.offer_id || '').trim();

        if (!offerId || !knownOffers[offerId]) return;

        const quantity = Math.max(0, Number(product.quantity || 0));

        if (!salesByOffer[offerId]) {
          salesByOffer[offerId] = {};
        }

        salesByOffer[offerId][clusterName] =
          (salesByOffer[offerId][clusterName] || 0) + quantity;
      });
    });

    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(OZON.CLUSTER_SALES_SHEET);

    if (!sh) {
      sh = ss.insertSheet(OZON.CLUSTER_SALES_SHEET);
    }

    sh.clear();

    const headers = [
      'Артикул',
      'Название',
      'Product ID',
      'Всего за ' + days + ' дней'
    ].concat(clusters);

    sh.getRange(1, 1, 1, headers.length).setValues([headers]);

    const output = catalog.map(function(item) {
      const clusterSales = salesByOffer[item.offerId] || {};
      let total = 0;

      const clusterValues = clusters.map(function(cluster) {
        const value = Number(clusterSales[cluster] || 0);
        total += value;
        return value;
      });

      return [
        item.offerId,
        item.name,
        item.productId,
        total
      ].concat(clusterValues);
    });

    if (output.length) {
      sh.getRange(
        2,
        1,
        output.length,
        headers.length
      ).setValues(output);
    }

    sh.setFrozenRows(1);
    sh.setFrozenColumns(4);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');

    const unknownList = Object.keys(unknownWarehouses);

    if (unknownList.length) {
      log_(
        'Не найден кластер склада',
        'INFO',
        unknownList.map(function(id) {
          return id + ': ' + unknownWarehouses[id];
        }).join(' | ')
      );
    }

    log_(
      'Продажи по кластерам',
      'OK',
      'Период: ' + days +
      ' дней; отправлений: ' + postingCount +
      '; кластеров: ' + clusters.length +
      '; неопознанных складов: ' + unknownList.length
    );

    if (!silent) {
      SpreadsheetApp.getUi().alert(
        'Продажи по кластерам загружены.\n' +
        'Кластеров Ozon: ' + clusters.length
      );
    }
  } catch (error) {
    handleError_('Продажи по кластерам', error);
  }
}


/**
 * Ozon требует обязательный cluster_type.
 * Проверяем только read-only варианты и берём первый принятый API.
 */
function loadClusterList_(apiKey) {
  if (CLUSTER_LIST_CACHE[apiKey]) return CLUSTER_LIST_CACHE[apiKey];

  const clusterTypes = [
    'CLUSTER_TYPE_OZON',
    'CLUSTER_TYPE_FBO',
    'CLUSTER_TYPE_ALL'
  ];

  const errors = [];

  for (let index = 0; index < clusterTypes.length; index++) {
    const clusterType = clusterTypes[index];

    try {
      const response = ozonRequest_(
        '/v1/cluster/list',
        {
          cluster_type: clusterType,
          cluster_ids: []
        },
        apiKey
      );

      CLUSTER_LIST_CACHE[apiKey] = {
        clusterType: clusterType,
        response: response
      };
      return CLUSTER_LIST_CACHE[apiKey];
    } catch (error) {
      errors.push(
        clusterType + ': ' +
        (
          error && error.message
            ? error.message
            : String(error)
        )
      );
    }
  }

  throw new Error(
    'Ozon не принял ни один проверенный cluster_type. ' +
    errors.join(' || ')
  );
}

/**
 * Разбирает ответ /v1/cluster/list.
 * Поддерживает несколько возможных оболочек ответа Ozon.
 */
function parseClusters_(response) {
  const clusterArray = findClusterArray_(response);
  const clusterNames = [];
  const warehouseToCluster = {};
  const clusterIdToName = {};

  clusterArray.forEach(function(cluster) {
    if (!cluster || typeof cluster !== 'object') return;

    const clusterName = String(
      cluster.name ||
      cluster.cluster_name ||
      cluster.title ||
      ''
    ).trim();

    if (!clusterName) return;

    if (clusterNames.indexOf(clusterName) === -1) {
      clusterNames.push(clusterName);
    }

    const clusterId = String(
      cluster.id ||
      cluster.cluster_id ||
      cluster.clusterId ||
      cluster.macrolocal_cluster_id ||
      ''
    ).trim();

    if (clusterId) {
      clusterIdToName[clusterId] = clusterName;
    }

    const warehouses = findWarehousesInCluster_(cluster);

    warehouses.forEach(function(warehouse) {
      if (!warehouse || typeof warehouse !== 'object') return;

      const warehouseId = String(
        warehouse.warehouse_id ||
        warehouse.id ||
        warehouse.warehouseId ||
        ''
      ).trim();

      if (warehouseId) {
        warehouseToCluster[warehouseId] = clusterName;
      }
    });
  });

  const recursiveMap = extractClusterIdNameMap_(response);
  Object.keys(recursiveMap).forEach(function(id) {
    clusterIdToName[id] = recursiveMap[id];
  });

  return {
    clusterNames: clusterNames,
    warehouseToCluster: warehouseToCluster,
    clusterIdToName: clusterIdToName
  };
}


/**
 * Рекурсивно собирает соответствия ID кластера → название.
 * Нужен для macrolocal_cluster_id из API поставок.
 */
function extractClusterIdNameMap_(value, result, depth) {
  result = result || {};
  depth = depth || 0;

  if (depth > 12 || value === null || value === undefined) {
    return result;
  }

  if (Array.isArray(value)) {
    value.forEach(function(item) {
      extractClusterIdNameMap_(item, result, depth + 1);
    });
    return result;
  }

  if (typeof value !== 'object') {
    return result;
  }

  const name = String(
    value.name ||
    value.cluster_name ||
    value.clusterName ||
    value.title ||
    value.macrolocal_cluster_name ||
    ''
  ).trim();

  const ids = [
    value.id,
    value.cluster_id,
    value.clusterId,
    value.macrolocal_cluster_id,
    value.macrolocalClusterId
  ];

  if (name) {
    ids.forEach(function(rawId) {
      const id = String(rawId || '').trim();
      if (id && /^\d+$/.test(id)) {
        result[id] = name;
      }
    });
  }

  Object.keys(value).forEach(function(key) {
    extractClusterIdNameMap_(value[key], result, depth + 1);
  });

  return result;
}

/**
 * Получает названия конкретных макролокальных кластеров по их ID.
 */
function loadClusterNamesByIds_(clusterIds, apiKey) {
  const uniqueIds = Array.from(
    new Set(
      (clusterIds || [])
        .map(function(id) { return String(id || '').trim(); })
        .filter(function(id) { return /^\d+$/.test(id); })
    )
  );

  if (!uniqueIds.length) return {};

  const numericIds = uniqueIds.map(function(id) { return Number(id); });
  const clusterTypes = [
    'CLUSTER_TYPE_OZON',
    'CLUSTER_TYPE_FBO',
    'CLUSTER_TYPE_ALL'
  ];

  let result = {};

  clusterTypes.forEach(function(clusterType) {
    try {
      const response = ozonRequest_(
        '/v1/cluster/list',
        {
          cluster_type: clusterType,
          cluster_ids: numericIds
        },
        apiKey
      );

      const found = extractClusterIdNameMap_(response);
      Object.keys(found).forEach(function(id) {
        result[id] = found[id];
      });
    } catch (ignore) {}
  });

  return result;
}

function findClusterArray_(response) {
  const candidates = [
    response && response.clusters,
    response && response.result && response.result.clusters,
    response && response.result,
    response && response.items
  ];

  for (let index = 0; index < candidates.length; index++) {
    if (Array.isArray(candidates[index])) {
      return candidates[index];
    }
  }

  return [];
}

function findWarehousesInCluster_(cluster) {
  const candidates = [
    cluster.warehouses,
    cluster.warehouse_list,
    cluster.warehouseList,
    cluster.logistic_clusters,
    cluster.delivery_warehouses
  ];

  for (let index = 0; index < candidates.length; index++) {
    if (Array.isArray(candidates[index])) {
      return flattenWarehouses_(candidates[index]);
    }
  }

  return [];
}

function flattenWarehouses_(items) {
  const result = [];

  items.forEach(function(item) {
    if (!item || typeof item !== 'object') return;

    if (
      item.warehouse_id !== undefined ||
      item.id !== undefined ||
      item.warehouseId !== undefined
    ) {
      result.push(item);
    }

    const nested = [
      item.warehouses,
      item.warehouse_list,
      item.warehouseList
    ];

    nested.forEach(function(array) {
      if (Array.isArray(array)) {
        Array.prototype.push.apply(result, flattenWarehouses_(array));
      }
    });
  });

  return result;
}

/**
 * Период продаж: последние полные дни, сегодняшний день не учитывается.
 */
function getCompletedSalesRange_(days) {
  const timezone = Session.getScriptTimeZone();
  const now = new Date();

  const todayText = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
  const todayStart = new Date(todayText + 'T00:00:00');

  const dateTo = new Date(todayStart.getTime() - 1);
  const dateFrom = new Date(todayStart);
  dateFrom.setDate(dateFrom.getDate() - Math.max(1, days));

  return {
    dateFrom: dateFrom,
    dateTo: dateTo
  };
}

function getSalesCoefficient_(sh) {
  return Math.max(
    0.01,
    Number(sh.getRange(OZON.SALES_COEFFICIENT_CELL).getValue()) || 1
  );
}

/**
 * Загружает FBO-отправления за период один раз за запуск скрипта.
 * Основной лист и кластерная таблица используют одни и те же данные.
 * Отменённые отправления отбрасываются сразу.
 */
function fetchFboPostings_(apiKey, dateFrom, dateTo) {
  const cacheKey = toIso_(dateFrom) + '|' + toIso_(dateTo);
  if (POSTINGS_CACHE[cacheKey]) return POSTINGS_CACHE[cacheKey];

  const result = [];
  let cursor = '';
  let page = 0;

  do {
    page++;

    const payload = {
      dir: 'ASC',
      filter: {
        since: toIso_(dateFrom),
        to: toIso_(dateTo)
      },
      limit: 100,
      translit: true,
      with: {
        analytics_data: true,
        financial_data: false
      }
    };

    if (cursor) {
      payload.cursor = cursor;
    }

    const response = ozonRequest_('/v3/posting/fbo/list', payload, apiKey);
    const postings = Array.isArray(response.postings) ? response.postings : [];

    postings.forEach(function(posting) {
      const status = String(posting.status || '').toLowerCase();
      if (status.indexOf('cancel') !== -1 || status.indexOf('отмен') !== -1) return;
      result.push(posting);
    });

    const hasNext = Boolean(response.has_next);
    const nextCursor = String(response.cursor || '').trim();

    if (!hasNext || !nextCursor || postings.length === 0) break;

    if (nextCursor === cursor) {
      throw new Error('Ozon вернул тот же cursor повторно.');
    }

    cursor = nextCursor;
    Utilities.sleep(250);

    if (page >= 500) {
      throw new Error('Загрузка отправлений остановлена после 500 страниц.');
    }
  } while (true);

  POSTINGS_CACHE[cacheKey] = result;
  return result;
}

function updateSales(silent) {
  try {
    const sh = getMainSheet_();
    const credentials = getCredentials_();
    const lastRow = getLastProductRow_(sh);

    if (lastRow < OZON.DATA_START_ROW) {
      throw new Error('Сначала выполните «Загрузить каталог».');
    }

    const rowCount = lastRow - OZON.DATA_START_ROW + 1;

    const offerRows = sh.getRange(
      OZON.DATA_START_ROW,
      1,
      rowCount,
      1
    ).getDisplayValues();

    const knownOffers = {};
    offerRows.forEach(function(row) {
      const offerId = String(row[0] || '').trim();
      if (offerId) knownOffers[offerId] = true;
    });

    const settings = getPlanningSettings_(sh);
    const range = getCompletedSalesRange_(settings.salesDays);
    const postings = fetchFboPostings_(credentials.mainKey, range.dateFrom, range.dateTo);

    const sales = {};
    const names = {};

    postings.forEach(function(posting) {
      const products = Array.isArray(posting.products) ? posting.products : [];

      products.forEach(function(product) {
        const offerId = String(product.offer_id || '').trim();
        if (!offerId || !knownOffers[offerId]) return;

        sales[offerId] = (sales[offerId] || 0) + Math.max(0, Number(product.quantity || 0));

        const name = String(product.name || '').trim();
        if (name && !names[offerId]) names[offerId] = name;
      });
    });

    const values = offerRows.map(function(row) {
      const offerId = String(row[0] || '').trim();
      return [Math.round((sales[offerId] || 0) * settings.coefficient)];
    });

    sh.getRange(
      OZON.DATA_START_ROW,
      5,
      values.length,
      1
    ).setValues(values);

    const filledNames = fillMissingNames_(sh, names);
    applyCalculationFormulas_(sh, rowCount);

    const message =
      'Продажи обновлены за ' + settings.salesDays +
      ' полных дней, коэффициент: ' + settings.coefficient +
      '. Отправлений: ' + postings.length +
      '. Добавлено названий: ' + filledNames + '.';

    log_('Обновление продаж', 'OK', message);

    if (!silent) {
      SpreadsheetApp.getUi().alert(message);
    }
  } catch (error) {
    handleError_('Обновление продаж', error);
  }
}

/**
 * Правила кратности поставки по типу товара.
 * Тип определяется по артикулу и, если оно известно, по названию.
 */
function normalizeSupplyText_(value) {
  return String(value || '').trim().toUpperCase();
}

function isSupplyExcluded_(offerId, name) {
  const offer = normalizeSupplyText_(offerId);
  const title = normalizeSupplyText_(name);

  return /^(ЕГ|ЕПГ|СИМПЛ)(?:[-_\s]|$)/.test(offer) ||
    /^(ЕГ|ЕПГ|СИМПЛ)(?:[-_\s]|$)/.test(title);
}

function isPhotoAlbum_(offerId, name) {
  const offer = normalizeSupplyText_(offerId);
  const title = normalizeSupplyText_(name);

  return offer.indexOf('ФА') === 0 ||
    offer.indexOf('FA') === 0 ||
    title.indexOf('ФОТОАЛЬБОМ') !== -1 ||
    title.indexOf('АЛЬБОМ ДЛЯ ФОТОГРАФИЙ') !== -1;
}

function isColoring_(offerId, name) {
  const offer = normalizeSupplyText_(offerId);
  const title = normalizeSupplyText_(name);
  return (offer + ' ' + title).indexOf('РАСКРАСК') !== -1;
}

function isSet_(offerId, name) {
  const offer = normalizeSupplyText_(offerId);
  const title = normalizeSupplyText_(name);
  return (offer + ' ' + title).indexOf('НАБОР') !== -1;
}

function roundSupplyQuantity_(quantity, offerId, name) {
  // Маленький допуск убирает ошибки округления вида 3.0000000001 → 4.
  const value = Math.max(0, Math.ceil((Number(quantity) || 0) - 1e-9));

  // Эти серии пока не поставляем.
  if (isSupplyExcluded_(offerId, name)) {
    return 0;
  }

  if (!value) return 0;

  // Фотоальбомы: минимум одна полная коробка, далее кратно 16.
  if (isPhotoAlbum_(offerId, name)) {
    return Math.max(16, Math.ceil(value / 16) * 16);
  }

  // Раскраски: минимум 10, далее кратно 10.
  if (isColoring_(offerId, name)) {
    return Math.max(10, Math.ceil(value / 10) * 10);
  }

  // Остальные наборы: минимум 10, далее кратно 5.
  if (isSet_(offerId, name)) {
    return Math.max(10, Math.ceil(value / 5) * 5);
  }

  return value;
}

function calculateSupply(silent) {
  try {
    const sh = getMainSheet_();
    const lastRow = getLastProductRow_(sh);

    if (lastRow < OZON.DATA_START_ROW) {
      throw new Error('Нет товаров для расчёта.');
    }

    const rowCount = lastRow - OZON.DATA_START_ROW + 1;
    applyCalculationFormulas_(sh, rowCount);

    log_(
      'Расчёт',
      'OK',
      'Рекомендации пересчитаны.'
    );

    if (silent === false) {
      SpreadsheetApp.getUi().alert(
        'Рекомендации пересчитаны.'
      );
    }
  } catch (error) {
    handleError_('Расчёт', error);
  }
}

function applyCalculationFormulas_(sh, rowCount) {
  if (rowCount <= 0) return;

  // Считаем значения в Apps Script, а не формулами Google Sheets.
  // Так расчёт не зависит от локали таблицы и не даёт #ERROR!.
  const settings = getPlanningSettings_(sh);

  const source = sh.getRange(
    OZON.DATA_START_ROW,
    1,
    rowCount,
    9
  ).getValues();
  const putRange = sh.getRange(OZON.DATA_START_ROW, OZON.PUT_COLUMN, rowCount, 1);
  const putBackgrounds = putRange.getBackgrounds();

  const avgValues = [];
  const recommendationValues = [];
  const putValues = [];
  const newPutBackgrounds = [];

  source.forEach(function(row, index) {
    const offerId = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    const oldPut = row[8];
    const isManual = isManualColor_(putBackgrounds[index][0]) && oldPut !== '';

    if (!offerId) {
      avgValues.push(['']);
      recommendationValues.push(['']);
      putValues.push(['']);
      newPutBackgrounds.push([OZON.AUTO_PLAN_COLOR]);
      return;
    }

    const result = computeSupplyPlan_(row[4], row[3], row[6], settings, offerId, name);

    avgValues.push([result.avgPerDay]);
    recommendationValues.push([result.plan]);

    // Ручное значение пользователя не трогаем, остальное пересчитываем.
    putValues.push([isManual ? oldPut : result.plan]);
    newPutBackgrounds.push([isManual ? OZON.MANUAL_PLAN_COLOR : OZON.AUTO_PLAN_COLOR]);
  });

  sh.getRange(OZON.DATA_START_ROW, 6, rowCount, 1)
    .setValues(avgValues)
    .setNumberFormat('0.00');

  sh.getRange(OZON.DATA_START_ROW, 8, rowCount, 1)
    .setValues(recommendationValues)
    .setNumberFormat('0');

  putRange
    .setValues(putValues)
    .setBackgrounds(newPutBackgrounds)
    .setNumberFormat('0');
}

function isManualColor_(color) {
  return String(color || '').toLowerCase() === OZON.MANUAL_PLAN_COLOR;
}

/**
 * Запоминает названия и ручные значения «Поставить» по offer_id,
 * чтобы перенести их после перезагрузки каталога.
 */
function readMainSheetState_(sh) {
  const state = {names: {}, manualPut: {}};
  const lastRow = getLastProductRow_(sh);
  if (lastRow < OZON.DATA_START_ROW) return state;

  const rowCount = lastRow - OZON.DATA_START_ROW + 1;
  const values = sh.getRange(OZON.DATA_START_ROW, 1, rowCount, 9).getValues();
  const backgrounds = sh.getRange(OZON.DATA_START_ROW, OZON.PUT_COLUMN, rowCount, 1).getBackgrounds();

  values.forEach(function(row, index) {
    const offerId = String(row[0] || '').trim();
    if (!offerId) return;

    const name = String(row[1] || '').trim();
    if (name) state.names[offerId] = name;

    if (isManualColor_(backgrounds[index][0]) && row[8] !== '') {
      state.manualPut[offerId] = row[8];
    }
  });

  return state;
}

function restoreManualPutValues_(sh, catalog, manualPut) {
  const allRows = Math.max(1, sh.getMaxRows() - OZON.DATA_START_ROW + 1);
  sh.getRange(OZON.DATA_START_ROW, OZON.PUT_COLUMN, allRows, 1)
    .setBackground(OZON.AUTO_PLAN_COLOR);

  if (!catalog.length) return;

  const values = [];
  const backgrounds = [];
  catalog.forEach(function(row) {
    const offerId = String(row[0] || '').trim();
    const isManual = Object.prototype.hasOwnProperty.call(manualPut, offerId);
    values.push([isManual ? manualPut[offerId] : '']);
    backgrounds.push([isManual ? OZON.MANUAL_PLAN_COLOR : OZON.AUTO_PLAN_COLOR]);
  });

  sh.getRange(OZON.DATA_START_ROW, OZON.PUT_COLUMN, catalog.length, 1)
    .setValues(values)
    .setBackgrounds(backgrounds);
}

/** Заполняет пустые названия в столбце B по найденным в API данным. */
function fillMissingNames_(sh, namesByOffer) {
  const lastRow = getLastProductRow_(sh);
  if (lastRow < OZON.DATA_START_ROW || !namesByOffer) return 0;

  const rowCount = lastRow - OZON.DATA_START_ROW + 1;
  const range = sh.getRange(OZON.DATA_START_ROW, 1, rowCount, 2);
  const values = range.getValues();
  let filled = 0;

  const names = values.map(function(row) {
    const offerId = String(row[0] || '').trim();
    const current = String(row[1] || '').trim();
    if (!current && offerId && namesByOffer[offerId]) {
      filled++;
      return [namesByOffer[offerId]];
    }
    return [row[1]];
  });

  if (filled) {
    sh.getRange(OZON.DATA_START_ROW, 2, rowCount, 1).setValues(names);
  }

  return filled;
}

/** Сбрасывает все ручные правки: «Поставить» и «План» снова считаются автоматически. */
function resetManualPlan() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Сбросить ручные правки?',
    'Все оранжевые ячейки «Поставить» и «План» будут пересчитаны автоматически.',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  try {
    const main = getMainSheet_();
    const allRows = Math.max(1, main.getMaxRows() - OZON.DATA_START_ROW + 1);
    main.getRange(OZON.DATA_START_ROW, OZON.PUT_COLUMN, allRows, 1)
      .setBackground(OZON.AUTO_PLAN_COLOR);

    const lastRow = getLastProductRow_(main);
    if (lastRow >= OZON.DATA_START_ROW) {
      applyCalculationFormulas_(main, lastRow - OZON.DATA_START_ROW + 1);
    }

    const sh = SpreadsheetApp.getActive().getSheetByName(OZON.CLUSTER_SALES_SHEET);
    let clusterCells = 0;
    if (sh && sh.getLastRow() >= OZON.CLUSTER_DATA_START_ROW) {
      const settings = getPlanningSettings_(main);
      const rowCount = sh.getLastRow() - OZON.CLUSTER_DATA_START_ROW + 1;
      getClusterPlanColumns_(sh).forEach(function(col) {
        const salesCol = col - 4;
        const data = sh.getRange(OZON.CLUSTER_DATA_START_ROW, 1, rowCount, 2).getValues();
        const block = sh.getRange(OZON.CLUSTER_DATA_START_ROW, salesCol, rowCount, 5).getValues();
        const planRange = sh.getRange(OZON.CLUSTER_DATA_START_ROW, col, rowCount, 1);
        const backgrounds = planRange.getBackgrounds();
        const values = planRange.getValues();

        block.forEach(function(row, index) {
          if (!isManualColor_(backgrounds[index][0])) return;
          const offerId = String(data[index][0] || '').trim();
          values[index][0] = offerId
            ? computeSupplyPlan_(row[0], row[1], row[2], settings, offerId, data[index][1]).plan
            : '';
          backgrounds[index][0] = OZON.AUTO_PLAN_COLOR;
          clusterCells++;
        });

        planRange.setValues(values).setBackgrounds(backgrounds);
      });
    }

    ui.alert('Ручные правки сброшены. Ячеек в кластерной таблице: ' + clusterCells + '.');
  } catch (error) {
    handleError_('Сброс ручных правок', error);
  }
}

function clearProductData() {
  const ui = SpreadsheetApp.getUi();

  const answer = ui.alert(
    'Очистить товары и расчёты?',
    'Client-Id в B2 и API-ключ в B3 останутся.',
    ui.ButtonSet.YES_NO
  );

  if (answer !== ui.Button.YES) {
    return;
  }

  const sh = getMainSheet_();
  clearDataArea_(sh);

  log_(
    'Очистка',
    'OK',
    'Товары и расчёты очищены.'
  );
}

function clearDataArea_(sh) {
  const rows = Math.max(
    sh.getMaxRows() - OZON.DATA_START_ROW + 1,
    1
  );

  sh.getRange(
    OZON.DATA_START_ROW,
    1,
    rows,
    10
  ).clearContent();
}

function ozonRequest_(path, body, apiKey) {
  const credentials = getCredentials_();
  const requestBody = body || {};
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Client-Id': credentials.clientId,
      'Api-Key': apiKey
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  // Каждый запрос больше не пишется в лог: это замедляло обновление
  // и раздувало лист «Лог». В лог попадают только ошибки и итоги операций.
  // При превышении лимита запросов (HTTP 429) ждём и повторяем.
  const rateLimitDelays = [2000, 5000, 10000];
  let response;
  let code;

  for (let attempt = 0; ; attempt++) {
    response = fetchWithRetry_(OZON.BASE_URL + path, options, path);
    code = response.getResponseCode();
    if (code !== 429 || attempt >= rateLimitDelays.length) break;

    log_('Лимит запросов Ozon', 'WARN', path + ': HTTP 429, повтор через ' + rateLimitDelays[attempt] / 1000 + ' с');
    Utilities.sleep(rateLimitDelays[attempt]);
  }

  const text = response.getContentText();

  let json;

  try {
    json = JSON.parse(text);
  } catch (parseError) {
    throw new Error(
      path +
      ' вернул не JSON. HTTP ' +
      code +
      ': ' +
      text.slice(0, 500)
    );
  }

  if (code < 200 || code >= 300) {
    const message =
      json.message ||
      (
        json.error &&
        json.error.message
      ) ||
      json.error ||
      text;

    throw new Error(
      path +
      ' | HTTP ' +
      code +
      ' | body=' + safeJson_(requestBody).slice(0, 300) +
      ' | ' +
      String(message).slice(0, 800)
    );
  }

  return json;
}


/**
 * Повторяет запрос при сетевой ошибке Apps Script.
 * HTTP-ответы Ozon не повторяет здесь — их обрабатывает ozonRequest_.
 */
function fetchWithRetry_(url, options, operationName) {
  const attempts = 4;
  const delays = [0, 1000, 2500, 5000];
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (delays[attempt] > 0) {
      Utilities.sleep(delays[attempt]);
    }

    try {
      return UrlFetchApp.fetch(url, options);
    } catch (error) {
      lastError = error;

      log_(
        'Сетевая попытка',
        'WARN',
        operationName +
        ': попытка ' + (attempt + 1) +
        ' из ' + attempts +
        '; ' + (
          error && error.message
            ? error.message
            : String(error)
        )
      );
    }
  }

  throw new Error(
    'Не удалось подключиться к Ozon API после ' +
    attempts +
    ' попыток. Последняя ошибка: ' +
    (
      lastError && lastError.message
        ? lastError.message
        : String(lastError)
    )
  );
}

function getMainSheet_() {
  const sh = SpreadsheetApp
    .getActive()
    .getSheetByName(OZON.SHEET);

  if (!sh) {
    throw new Error(
      'Нет листа "' + OZON.SHEET + '".'
    );
  }

  return sh;
}

function getLastProductRow_(sh) {
  const availableRows = Math.max(
    sh.getLastRow() - OZON.DATA_START_ROW + 1,
    1
  );

  const values = sh.getRange(
    OZON.DATA_START_ROW,
    1,
    availableRows,
    1
  ).getDisplayValues();

  for (let index = values.length - 1; index >= 0; index--) {
    if (String(values[index][0] || '').trim()) {
      return OZON.DATA_START_ROW + index;
    }
  }

  return OZON.DATA_START_ROW - 1;
}

function log_(operation, status, message) {
  const ss = SpreadsheetApp.getActive();

  let sh = ss.getSheetByName(OZON.LOG_SHEET);

  if (!sh) {
    sh = ss.insertSheet(OZON.LOG_SHEET);
  }

  if (sh.getLastRow() === 0) {
    sh.getRange('A1:D1').setValues([[
      'Дата и время',
      'Операция',
      'Статус',
      'Сообщение'
    ]]);
  }

  sh.appendRow([
    new Date(),
    operation,
    status,
    String(message).slice(0, 5000)
  ]);

  // Храним только последние записи, чтобы лог не рос бесконечно.
  const extra = sh.getLastRow() - 1 - OZON.LOG_MAX_ROWS;
  if (extra > 0) {
    sh.deleteRows(2, extra);
  }
}

function showLastLog() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(OZON.LOG_SHEET);

  if (!sh || sh.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Лог пока пуст.');
    return;
  }

  const row = sh.getRange(
    sh.getLastRow(),
    1,
    1,
    4
  ).getDisplayValues()[0];

  SpreadsheetApp.getUi().alert(
    row[1] + ' — ' + row[2] + '\n\n' + row[3]
  );
}

function handleError_(operation, error) {
  const message =
    error && error.message
      ? error.message
      : String(error);

  log_(
    operation,
    'ERROR',
    'Версия ' + APP_VERSION + '. ' + message
  );

  if (BATCH_MODE) {
    BATCH_ERROR = error instanceof Error ? error : new Error(message);
    return;
  }

  SpreadsheetApp.getUi().alert(
    'Версия: ' + APP_VERSION + '\n' +
    'Операция: ' + operation + '\n\n' +
    'Ошибка: ' + message
  );
}

function safeJson_(value) {
  try {
    return JSON.stringify(value).slice(0, 1000);
  } catch (error) {
    return '[не удалось сериализовать тело запроса]';
  }
}

function toIso_(date) {
  return Utilities.formatDate(
    date,
    'GMT',
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
  );
}



/**
 * Загружает продажи за выбранный период и распределяет их по уже известным
 * кластерам. Использует warehouse_id -> cluster из /v1/cluster/list.
 */
function loadClusterSalesData_(mainSheet, apiKey, clusters) {
  const clusterResult = loadClusterList_(apiKey);
  const clusterInfo = parseClusters_(clusterResult.response);
  const warehouseToCluster = clusterInfo.warehouseToCluster;

  const settings = getPlanningSettings_(mainSheet);
  const range = getCompletedSalesRange_(settings.salesDays);
  const postings = fetchFboPostings_(apiKey, range.dateFrom, range.dateTo);

  const allowedClusters = {};
  clusters.forEach(function(cluster) { allowedClusters[cluster] = true; });

  const salesByOffer = {};
  const names = {};
  let unmatchedQuantity = 0;

  postings.forEach(function(posting) {
    const analytics = posting.analytics_data || {};
    const warehouseId = String(analytics.warehouse_id || '').trim();
    const cluster = warehouseToCluster[warehouseId] || '';
    const products = Array.isArray(posting.products) ? posting.products : [];

    products.forEach(function(product) {
      const offerId = String(product.offer_id || '').trim();
      if (!offerId) return;
      const quantity = Math.max(0, Number(product.quantity || 0));
      const name = String(product.name || '').trim();
      if (name && !names[offerId]) names[offerId] = name;

      if (!cluster || !allowedClusters[cluster]) {
        unmatchedQuantity += quantity;
        return;
      }

      if (!salesByOffer[offerId]) salesByOffer[offerId] = {};
      salesByOffer[offerId][cluster] =
        (salesByOffer[offerId][cluster] || 0) + quantity;
    });
  });

  Object.keys(salesByOffer).forEach(function(offerId) {
    Object.keys(salesByOffer[offerId]).forEach(function(cluster) {
      salesByOffer[offerId][cluster] = Math.round(
        salesByOffer[offerId][cluster] * settings.coefficient
      );
    });
  });

  if (unmatchedQuantity > 0) {
    log_(
      'Продажи без кластера',
      'INFO',
      'Штук без определённого кластера: ' + unmatchedQuantity +
      '. Они есть на основном листе, но не попали в кластерную таблицу.'
    );
  }

  return {salesByOffer: salesByOffer, names: names};
}

/**
 * Загружает доступные остатки FBO по складам Ozon и сводит их
 * в те же 22 кластерных столбца, которые уже находятся на листе
 * «Продажи по кластерам».
 *
 * Источник: POST /v2/analytics/stock_on_warehouses
 * В остаток включается free_to_sell_amount — товар, доступный к продаже.
 */
function updateClusterStocks(silent) {
  try {
    const ss = SpreadsheetApp.getActive();
    const mainSheet = getMainSheet_();
    const sh = ss.getSheetByName(OZON.CLUSTER_SALES_SHEET);
    const credentials = getCredentials_();
    const lastRow = getLastProductRow_(mainSheet);

    if (lastRow < OZON.DATA_START_ROW) {
      throw new Error('Сначала выполните «Загрузить каталог».');
    }

    if (!sh || sh.getLastColumn() < 5) {
      throw new Error('Сначала выполните «Продажи по кластерам».');
    }

    /*
     * Читаем любую из предыдущих структур:
     * 1) один столбец на кластер;
     * 2) Продажи / Остаток / План;
     * 3) версия 2.1: Продажи / Остаток / Дней запаса / План;
     * 4) версия 2.2: Продажи / Остаток / В пути / Дней запаса / План.
     */
    const lastSheetCol = sh.getLastColumn();
    const hasControlPanel = String(sh.getRange('A1').getDisplayValue()).trim() === 'Фильтр товара';
    const headerRow = hasControlPanel ? 3 : 1;
    const subHeaderRow = hasControlPanel ? 4 : 2;
    const dataStartRow = hasControlPanel ? 5 : 3;

    const firstRow = sh.getRange(headerRow, 1, 1, lastSheetCol).getDisplayValues()[0];
    const secondRow = sh.getLastRow() >= subHeaderRow
      ? sh.getRange(subHeaderRow, 1, 1, lastSheetCol).getDisplayValues()[0]
      : [];

    const isUnified = secondRow.some(function(value) {
      return String(value || '').trim() === 'Продажи';
    });
    const hasTransitColumn = secondRow.some(function(value) {
      return String(value || '').trim() === 'В пути';
    });
    const hasDaysColumn = secondRow.some(function(value) {
      return String(value || '').trim() === 'Дней запаса';
    });
    const oldStride = hasTransitColumn ? 5 : (hasDaysColumn ? 4 : 3);

    const clusters = [];
    // Ручные значения «План» (оранжевые ячейки): offerId -> кластер -> значение.
    const manualPlanByOffer = {};

    if (isUnified) {
      for (let col = 5; col <= lastSheetCol; col += oldStride) {
        const cluster = String(firstRow[col - 1] || '').trim();
        if (cluster) clusters.push(cluster);
      }

      const dataRows = Math.max(0, sh.getLastRow() - dataStartRow + 1);
      if (dataRows && oldStride === 5) {
        const values = sh.getRange(dataStartRow, 1, dataRows, lastSheetCol).getValues();
        const backgrounds = sh.getRange(dataStartRow, 1, dataRows, lastSheetCol).getBackgrounds();
        values.forEach(function(row, rowIndex) {
          const offerId = String(row[0] || '').trim();
          if (!offerId) return;
          clusters.forEach(function(cluster, index) {
            const planIndex = 4 + index * oldStride + 4;
            if (isManualColor_(backgrounds[rowIndex][planIndex]) && row[planIndex] !== '') {
              if (!manualPlanByOffer[offerId]) manualPlanByOffer[offerId] = {};
              manualPlanByOffer[offerId][cluster] = row[planIndex];
            }
          });
        });
      }
    } else {
      firstRow.slice(4).forEach(function(value) {
        const cluster = String(value || '').trim();
        if (cluster) clusters.push(cluster);
      });
    }

    if (clusters.length === 0) {
      throw new Error('Не удалось прочитать названия кластеров.');
    }

    // Продажи всегда берутся только из свежего ответа API.
    // Старые значения с листа не переносятся, иначе товар без продаж
    // за новый период сохранил бы устаревшие цифры.
    const freshSales = loadClusterSalesData_(mainSheet, credentials.mainKey, clusters);
    const salesByOffer = freshSales.salesByOffer;
    const apiNames = freshSales.names;

    const rowCount = lastRow - OZON.DATA_START_ROW + 1;
    const catalogRows = mainSheet.getRange(OZON.DATA_START_ROW, 1, rowCount, 3).getDisplayValues();
    const catalog = [];
    const offerLookup = {};
    const skuLookup = {};

    catalogRows.forEach(function(row) {
      const offerId = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      const productId = String(row[2] || '').trim();
      if (!offerId) return;
      catalog.push({offerId: offerId, name: name, productId: productId});
      if (name) apiNames[offerId] = name;
      offerLookup[normalizeKey_(offerId)] = offerId;
      if (productId) skuLookup[normalizeKey_(productId)] = offerId;
    });

    const stockByOffer = {};
    const unknownWarehouses = {};
    let offset = 0;
    let page = 0;
    let receivedRows = 0;

    do {
      page++;
      const response = ozonRequest_(
        '/v2/analytics/stock_on_warehouses',
        {limit: 1000, offset: offset, warehouse_type: 'FULFILLMENT'},
        credentials.mainKey
      );

      const rows = response && response.result && Array.isArray(response.result.rows)
        ? response.result.rows
        : [];
      receivedRows += rows.length;

      rows.forEach(function(item) {
        const itemCode = String(item.item_code || item.offer_id || item.offerId || '').trim();
        const sku = String(item.sku || '').trim();
        const warehouseName = String(item.warehouse_name || '').trim();
        const offerId = offerLookup[normalizeKey_(itemCode)] || skuLookup[normalizeKey_(sku)] || '';
        if (!offerId || !warehouseName) return;

        const itemName = String(item.item_name || item.name || '').trim();
        if (itemName && !apiNames[offerId]) apiNames[offerId] = itemName;

        const cluster = matchWarehouseToCluster_(warehouseName, clusters);
        if (!cluster) {
          unknownWarehouses[warehouseName] = true;
          return;
        }

        const freeToSell = Math.max(0, firstFiniteNumber_([
          item.free_to_sell_amount,
          item.present,
          item.available,
          item.stock,
          item.quantity
        ]));

        if (!stockByOffer[offerId]) stockByOffer[offerId] = {};
        stockByOffer[offerId][cluster] = (stockByOffer[offerId][cluster] || 0) + freeToSell;
      });

      if (rows.length < 1000) break;
      offset += rows.length;
      Utilities.sleep(250);
      if (page >= 500) throw new Error('Остановлено после 500 страниц.');
    } while (true);

    // Лист «Поставки в пути» уже обновлён в refreshEverything().
    const transitByOffer = loadTransitByOfferCluster_(clusters);

    // Названия, найденные в отправлениях и отчёте об остатках,
    // дописываем в основной лист, чтобы они сохранились до следующего раза.
    fillMissingNames_(mainSheet, apiNames);

    const settings = getPlanningSettings_(mainSheet);
    const stride = 5;
    const totalColumns = 4 + clusters.length * stride;

    const outputObjects = catalog.map(function(item) {
      const name = item.name || apiNames[item.offerId] || '';
      const row = [item.offerId, name, item.productId, 0];
      const manual = [];
      let totalSales = 0;

      clusters.forEach(function(cluster) {
        const sales = Number((salesByOffer[item.offerId] || {})[cluster] || 0);
        const stock = Number((stockByOffer[item.offerId] || {})[cluster] || 0);
        const transit = Number((transitByOffer[item.offerId] || {})[cluster] || 0);
        const result = computeSupplyPlan_(sales, stock, transit, settings, item.offerId, name);
        const manualPlans = manualPlanByOffer[item.offerId] || {};
        const isManual = Object.prototype.hasOwnProperty.call(manualPlans, cluster);

        totalSales += sales;
        manual.push(isManual);
        row.push(
          sales,
          stock,
          transit,
          result.daysStock,
          isManual ? manualPlans[cluster] : result.plan
        );
      });

      row[3] = totalSales;
      return {row: row, manual: manual, totalSales: totalSales, offerId: item.offerId, name: name};
    });

    // По умолчанию сверху самые продаваемые товары.
    outputObjects.sort(function(a, b) {
      if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
      return a.offerId.localeCompare(b.offerId, 'ru');
    });
    const output = outputObjects.map(function(item) { return item.row; });
    const manualFlags = outputObjects.map(function(item) { return item.manual; });

    const structureIsReady =
      sh.getRange('A3').getDisplayValue() === 'Артикул' &&
      sh.getRange('A4').isPartOfMerge() &&
      sh.getMaxColumns() >= totalColumns;

    if (!BUILD_MODE && !structureIsReady) {
      throw new Error('Структура таблицы не создана. Сначала нажмите «1. Создать таблицы».');
    }

    if (BUILD_MODE || !structureIsReady) {
      sh.setFrozenRows(0);
      sh.setFrozenColumns(0);
      sh.getDataRange().breakApart();
      sh.clear();
      sh.clearConditionalFormatRules();

      // Панель выбора создаётся один раз и больше не трогается при обновлениях.
      sh.getRange('A1').setValue('Фильтр товара');
      const selectorCell = sh.getRange('B1');
      selectorCell.clearDataValidations();
      selectorCell.clearContent();
    } else {
      // При обычном обновлении сохраняем B1, проверку данных, ширины, цвета и закрепления.
      const oldLastRow = sh.getLastRow();
      if (oldLastRow >= 5) {
        sh.getRange(5, 1, oldLastRow - 4, totalColumns).clearContent();
      }
      sh.showRows(5, Math.max(1, sh.getMaxRows() - 4));
    }

    sh.getRange('C1').setValue('Товаров: ' + output.length);
    sh.getRange('D1').setValue('Обновлено: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'));
    if (BUILD_MODE || !structureIsReady) {
    sh.getRange(1, 1, 1, 4)
      .setFontWeight('bold')
      .setBackground('#d9eaf7')
      .setVerticalAlignment('middle');
    sh.setRowHeight(1, 28);
    sh.setRowHeight(2, 6);

    const header1 = new Array(totalColumns).fill('');
    const header2 = new Array(totalColumns).fill('');
    header1[0] = 'Артикул';
    header1[1] = 'Название';
    header1[2] = 'Product ID';
    header1[3] = 'Всего продаж';

    clusters.forEach(function(cluster, index) {
      const base = 4 + index * stride;
      header1[base] = cluster;
      header2[base] = 'Продажи';
      header2[base + 1] = 'Остаток';
      header2[base + 2] = 'В пути';
      header2[base + 3] = 'Дней запаса';
      header2[base + 4] = 'План';
    });

    sh.getRange(3, 1, 2, totalColumns).setValues([header1, header2]);
    for (let col = 1; col <= 4; col++) sh.getRange(3, col, 2, 1).merge();
    clusters.forEach(function(cluster, index) {
      sh.getRange(3, 5 + index * stride, 1, stride).merge();
    });

    }

    if (output.length) {
      sh.getRange(5, 1, output.length, totalColumns).setValues(output);
    }

    // Оформление заголовков: чередование кластеров помогает не сливаться.
    sh.getRange(3, 1, 2, 4)
      .setBackground('#1f4e78')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    clusters.forEach(function(cluster, index) {
      const startCol = 5 + index * stride;
      const headerColor = index % 2 === 0 ? '#4472c4' : '#5b9bd5';
      const subColor = index % 2 === 0 ? '#d9e2f3' : '#ddebf7';
      sh.getRange(3, startCol, 1, stride)
        .setBackground(headerColor)
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sh.getRange(4, startCol, 1, stride)
        .setBackground(subColor)
        .setFontWeight('bold');
      sh.getRange(3, startCol, Math.max(2, output.length + 2), stride)
        .setBorder(true, true, true, true, false, false, '#7f8c8d', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    });

    sh.getRange(3, 1, 2, totalColumns)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
    sh.setRowHeight(3, 32);
    sh.setRowHeight(4, 30);

    if (output.length) {
      const dataRange = sh.getRange(5, 1, output.length, totalColumns);
      dataRange.setVerticalAlignment('middle');
      sh.getRange(5, 4, output.length, totalColumns - 3).setHorizontalAlignment('center');
      sh.getRange(5, 1, output.length, 1).setFontWeight('bold');
      sh.getRange(5, 4, output.length, 1).setFontWeight('bold').setBackground('#e2f0d9');

      // Подсветка по дням запаса относительно целевого запаса из B6:
      // красный — меньше цели, жёлтый — около цели (±10%), зелёный — больше.
      clusters.forEach(function(cluster, index) {
        const baseCol = 5 + index * stride;
        const salesStockBackgrounds = [];
        const transitBackgrounds = [];
        const daysBackgrounds = [];
        const planBackgrounds = [];

        output.forEach(function(row, rowIndex) {
          const sales = Number(row[baseCol - 1] || 0);
          const stock = Number(row[baseCol] || 0);
          const transit = Number(row[baseCol + 1] || 0);
          const daysStock = Number(row[baseCol + 2] || 0);
          let color = '#f2f2f2';

          if (sales > 0) {
            if (daysStock < settings.stockDays * 0.9) {
              color = '#f4cccc';     // дефицит
            } else if (daysStock <= settings.stockDays * 1.1) {
              color = '#fff2cc';     // около цели
            } else {
              color = '#d9ead3';     // профицит
            }
          } else if (stock + transit > 0) {
            color = '#d9ead3';
          }
          const daysColor = color;

          salesStockBackgrounds.push([color, color]);
          transitBackgrounds.push([transit > 0 ? '#cfe2f3' : '#f2f2f2']);
          daysBackgrounds.push([daysColor]);
          planBackgrounds.push([
            manualFlags[rowIndex][index] ? OZON.MANUAL_PLAN_COLOR : OZON.AUTO_PLAN_COLOR
          ]);
        });

        sh.getRange(5, baseCol, output.length, 2).setBackgrounds(salesStockBackgrounds);
        sh.getRange(5, baseCol + 2, output.length, 1).setBackgrounds(transitBackgrounds);
        sh.getRange(5, baseCol + 3, output.length, 1)
          .setBackgrounds(daysBackgrounds)
          .setNumberFormat('0.0');
        sh.getRange(5, baseCol + 4, output.length, 1).setBackgrounds(planBackgrounds);
      });

      // Тонкие горизонтальные линии и компактные строки.
      sh.getRange(5, 1, output.length, totalColumns)
        .setBorder(null, null, true, null, null, null, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID);
      sh.setRowHeights(5, output.length, 24);
    }

    sh.setFrozenRows(4);
    sh.setFrozenColumns(4);
    sh.setColumnWidth(1, 145);
    sh.setColumnWidth(2, 160);
    sh.setColumnWidth(3, 88);
    sh.setColumnWidth(4, 82);
    clusters.forEach(function(cluster, index) {
      const startCol = 5 + index * stride;
      sh.setColumnWidth(startCol, 58);
      sh.setColumnWidth(startCol + 1, 58);
      sh.setColumnWidth(startCol + 2, 58);
      sh.setColumnWidth(startCol + 3, 66);
      sh.setColumnWidth(startCol + 4, 58);
    });

    // Выпадающий список товара хранится на скрытом справочном листе.
    // Селектор восстанавливается только после полного завершения создания/обновления.

    if (!BUILD_MODE) applyProductSelector_(sh, String(sh.getRange('B1').getDisplayValue() || ''));

    const oldStocksSheet = ss.getSheetByName(OZON.CLUSTER_STOCKS_SHEET);
    if (oldStocksSheet) ss.deleteSheet(oldStocksSheet);

    const unknownList = Object.keys(unknownWarehouses).sort();
    if (unknownList.length) log_('Не определён кластер остатка', 'INFO', unknownList.join(' | '));

    log_(
      'Общая таблица кластеров',
      'OK',
      'Строк API: ' + receivedRows +
      '; кластеров: ' + clusters.length +
      '; неопознанных складов: ' + unknownList.length
    );

    if (!silent) {
      SpreadsheetApp.getUi().alert(
        'Готово. Таблица отсортирована по продажам.\n' +
        'Красный — дефицит, зелёный — профицит, голубой — в пути, жёлтый — план, ' +
        'оранжевый — ручная правка плана.\n' +
        'В B1 можно выбрать конкретный товар. Пустая B1 показывает все товары.'
      );
    }
  } catch (error) {
    handleError_('Продажи, остатки и план по кластерам', error);
  }
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const range = e.range;
    const sh = range.getSheet();
    const name = sh.getName();

    if (name === OZON.CLUSTER_SALES_SHEET && range.getA1Notation() === 'B1') {
      applyProductSelector_(sh, String(e.value || ''));
      return;
    }

    if (name === OZON.SHEET) {
      markMainSheetManualEdits_(sh, range);
    } else if (name === OZON.CLUSTER_SALES_SHEET) {
      markClusterPlanManualEdits_(sh, range);
    }
  } catch (error) {
    log_('Ручная правка', 'ERROR', error && error.message ? error.message : String(error));
  }
}

/**
 * Правка «Поставить»: непустое значение становится ручным (оранжевым),
 * очищенная ячейка сразу получает рекомендацию из H и снова считается авто.
 */
function markMainSheetManualEdits_(sh, range) {
  const firstRow = Math.max(range.getRow(), OZON.DATA_START_ROW);
  const lastRow = range.getLastRow();
  const col = OZON.PUT_COLUMN;
  if (lastRow < firstRow || range.getColumn() > col || range.getLastColumn() < col) return;

  const rowCount = lastRow - firstRow + 1;
  const values = sh.getRange(firstRow, 1, rowCount, col).getValues();
  const putValues = [];
  const backgrounds = [];

  values.forEach(function(row) {
    const offerId = String(row[0] || '').trim();
    const put = row[col - 1];
    if (offerId && put === '') {
      putValues.push([row[7]]);
      backgrounds.push([OZON.AUTO_PLAN_COLOR]);
    } else {
      putValues.push([put]);
      backgrounds.push([offerId ? OZON.MANUAL_PLAN_COLOR : OZON.AUTO_PLAN_COLOR]);
    }
  });

  sh.getRange(firstRow, col, rowCount, 1).setValues(putValues).setBackgrounds(backgrounds);
}

/**
 * Правка «План» в кластерной таблице: непустое значение — ручное,
 * очищенная ячейка сразу получает авторасчёт по строке.
 */
function markClusterPlanManualEdits_(sh, range) {
  const firstRow = Math.max(range.getRow(), OZON.CLUSTER_DATA_START_ROW);
  const lastRow = range.getLastRow();
  if (lastRow < firstRow) return;

  const planCols = getClusterPlanColumns_(sh).filter(function(col) {
    return col >= range.getColumn() && col <= range.getLastColumn();
  });
  if (!planCols.length) return;

  const rowCount = lastRow - firstRow + 1;
  const ids = sh.getRange(firstRow, 1, rowCount, 2).getValues();
  let settings = null;

  planCols.forEach(function(col) {
    const block = sh.getRange(firstRow, col - 4, rowCount, 5).getValues();
    const values = [];
    const backgrounds = [];

    block.forEach(function(row, index) {
      const offerId = String(ids[index][0] || '').trim();
      const plan = row[4];
      if (offerId && plan === '') {
        settings = settings || getPlanningSettings_(getMainSheet_());
        values.push([computeSupplyPlan_(row[0], row[1], row[2], settings, offerId, ids[index][1]).plan]);
        backgrounds.push([OZON.AUTO_PLAN_COLOR]);
      } else {
        values.push([plan]);
        backgrounds.push([offerId ? OZON.MANUAL_PLAN_COLOR : OZON.AUTO_PLAN_COLOR]);
      }
    });

    sh.getRange(firstRow, col, rowCount, 1).setValues(values).setBackgrounds(backgrounds);
  });
}

/** Номера столбцов «План» в кластерной таблице (по строке подзаголовков 4). */
function getClusterPlanColumns_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 5 || sh.getLastRow() < 4) return [];

  const header = sh.getRange(4, 1, 1, lastCol).getDisplayValues()[0];
  const result = [];
  for (let col = 5; col <= lastCol; col++) {
    if (String(header[col - 1] || '').trim() === 'План') result.push(col);
  }
  return result;
}

/**
 * Показывает только выбранный товар. Строки скрываются диапазонами,
 * а не по одной, поэтому фильтр работает быстро на большом каталоге.
 */
function applyProductSelector_(sh, selectedLabel) {
  const dataStartRow = OZON.CLUSTER_DATA_START_ROW;
  const lastRow = sh.getLastRow();
  if (lastRow < dataStartRow) return;

  const rowCount = lastRow - dataStartRow + 1;
  sh.showRows(dataStartRow, rowCount);
  const selected = String(selectedLabel || '').trim();
  if (!selected) return;

  const offerId = selected.split(' — ')[0].trim();
  const offers = sh.getRange(dataStartRow, 1, rowCount, 1).getDisplayValues();

  let runStart = -1;
  offers.forEach(function(row, index) {
    const hide = String(row[0] || '').trim() !== offerId;
    if (hide && runStart < 0) runStart = index;
    if (!hide && runStart >= 0) {
      sh.hideRows(dataStartRow + runStart, index - runStart);
      runStart = -1;
    }
  });
  if (runStart >= 0) {
    sh.hideRows(dataStartRow + runStart, offers.length - runStart);
  }
}

/**
 * Сопоставляет название склада Ozon с одним из готовых кластеров таблицы.
 *
 * Сравнение идёт по целым словам, а не по подстроке: так «Смоленск»
 * больше не попадает в Москву через «мо», а «Артёмовский» — в Дальний Восток.
 * Сначала проверяются более длинные (более точные) названия,
 * поэтому «Ростов Великий» уходит в Ярославль, а не в Ростов-на-Дону.
 */
const WAREHOUSE_ALIASES = {
  'екатеринбург': ['екатеринбург', 'екб', 'кольцово'],
  'пермь': ['пермь'],
  'санкт петербург': ['санкт петербург', 'спб', 'шушары', 'бугры'],
  'калининград': ['калининград', 'храброво'],
  'воронеж': ['воронеж', 'рамонь'],
  'краснодар': ['краснодар', 'адыгейск', 'новая адыгея'],
  'уфа': ['уфа'],
  'самара': ['самара', 'чапаевск'],
  'москва': ['москва', 'московская область', 'хоругвино', 'петровское', 'пушкино', 'домодедово', 'подольск', 'софьино', 'новая рига', 'гривно', 'павловская слобода', 'жуковский', 'черная грязь'],
  'красноярск': ['красноярск'],
  'дальний восток': ['хабаровск', 'владивосток', 'артем', 'благовещенск', 'южно сахалинск', 'петропавловск камчатский'],
  'тюмень': ['тюмень'],
  'ростов': ['ростов', 'ростов на дону', 'аксай'],
  'казань': ['казань', 'зеленодольск'],
  'ярославль': ['ярославль', 'ростов великий'],
  'оренбург': ['оренбург'],
  'новосибирск': ['новосибирск', 'обь'],
  'саратов': ['саратов', 'энгельс'],
  'невинномысск': ['невинномысск', 'ставрополь'],
  'махачкала': ['махачкала', 'дагестан'],
  'омск': ['омск'],
  'тверь': ['тверь']
};

function containsPhrase_(text, phrase) {
  if (!text || !phrase) return false;
  return (' ' + text + ' ').indexOf(' ' + phrase + ' ') !== -1;
}

function matchWarehouseToCluster_(warehouseName, clusters) {
  const warehouse = normalizeGeo_(warehouseName);
  if (!warehouse) return '';

  const candidates = [];

  clusters.forEach(function(cluster) {
    const clusterKey = normalizeGeo_(cluster);
    if (!clusterKey) return;

    // Полное название кластера как фраза в названии склада, и наоборот
    // (например, склад «Казань» и кластер «Казань»).
    candidates.push({phrase: clusterKey, cluster: cluster});

    Object.keys(WAREHOUSE_ALIASES).forEach(function(key) {
      if (!containsPhrase_(clusterKey, key)) return;
      WAREHOUSE_ALIASES[key].forEach(function(alias) {
        candidates.push({phrase: normalizeGeo_(alias), cluster: cluster});
      });
    });
  });

  // Длинные фразы точнее коротких, поэтому проверяем их первыми.
  candidates.sort(function(a, b) { return b.phrase.length - a.phrase.length; });

  for (let i = 0; i < candidates.length; i++) {
    if (containsPhrase_(warehouse, candidates[i].phrase)) {
      return candidates[i].cluster;
    }
  }

  // Название кластера целиком совпало со складом из одного слова.
  for (let i = 0; i < candidates.length; i++) {
    if (containsPhrase_(candidates[i].phrase, warehouse) && warehouse.length >= 4) {
      return candidates[i].cluster;
    }
  }

  return '';
}

function normalizeGeo_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey_(value) {
  return String(value || '').trim().toLowerCase();
}


/** Создаёт служебный лист поставок в пути. */
function ensureTransitSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(OZON.TRANSIT_SHEET);
  if (!sh) sh = ss.insertSheet(OZON.TRANSIT_SHEET);

  const headers = [
    'Кластер',
    'Артикул',
    'Количество',
    'ID кластера',
    'Номера заявок',
    'Статусы'
  ];

  if (String(sh.getRange('A1').getDisplayValue()).trim() !== 'Кластер') {
    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setBackground('#1f4e78')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 220);
    sh.setColumnWidth(2, 190);
    sh.setColumnWidth(3, 95);
    sh.setColumnWidth(4, 100);
    sh.setColumnWidth(5, 260);
    sh.setColumnWidth(6, 240);
  }
}


/**
 * Собирает текстовые значения из ответа API, связанные со складом,
 * адресом, кластером или названием.
 */
function collectWarehouseTexts_(value, result, depth, parentKey) {
  result = result || [];
  depth = depth || 0;
  parentKey = parentKey || '';

  if (depth > 12 || value === null || value === undefined) {
    return result;
  }

  if (Array.isArray(value)) {
    value.forEach(function(item) {
      collectWarehouseTexts_(item, result, depth + 1, parentKey);
    });
    return result;
  }

  if (typeof value !== 'object') {
    const key = String(parentKey || '').toLowerCase();
    if (
      typeof value === 'string' &&
      (
        key.indexOf('warehouse') !== -1 ||
        key.indexOf('cluster') !== -1 ||
        key.indexOf('address') !== -1 ||
        key === 'name' ||
        key.indexOf('name') !== -1
      )
    ) {
      const text = String(value || '').trim();
      if (text) result.push(text);
    }
    return result;
  }

  Object.keys(value).forEach(function(key) {
    collectWarehouseTexts_(value[key], result, depth + 1, key);
  });

  return result;
}

/**
 * Определяет каноническое название кластера по деталям заявки.
 */
function resolveOrderClusterFromDetails_(orderId, clusters, apiKey) {
  try {
    const details = ozonRequest_(
      '/v1/supply-order/details',
      {order_id: Number(orderId)},
      apiKey
    );

    const texts = collectWarehouseTexts_(details);

    for (let i = 0; i < texts.length; i++) {
      const cluster = matchWarehouseToCluster_(texts[i], clusters);
      if (cluster) return cluster;
    }
  } catch (ignore) {}

  return '';
}

/**
 * Загружает все активные заявки FBO, получает состав по bundle_id,
 * агрегирует количество по артикулу и макролокальному кластеру.
 */
function refreshTransitSheetFromApi_(clusters, apiKey) {
  ensureTransitSheet_();

  const clusterResult = loadClusterList_(apiKey);
  const clusterInfo = parseClusters_(clusterResult.response);
  const clusterIdToApiName = clusterInfo.clusterIdToName || {};

  const activeStates = [
    'IN_TRANSIT',
    'ACCEPTANCE_AT_STORAGE_WAREHOUSE',
    'REPORTS_CONFIRMATION_AWAITING',
    'DATA_FILLING',
    'READY_TO_SUPPLY',
    'ACCEPTED_AT_SUPPLY_WAREHOUSE'
  ];

  const allOrderIds = [];
  let lastId = '';
  let listPage = 0;

  do {
    listPage++;
    const previousLastId = lastId;
    const listResponse = ozonRequest_(
      '/v3/supply-order/list',
      {
        filter: {states: activeStates},
        last_id: lastId,
        limit: 100,
        sort_by: 'ORDER_CREATION',
        sort_dir: 'DESC'
      },
      apiKey
    );

    const ids = Array.isArray(listResponse.order_ids)
      ? listResponse.order_ids
      : [];

    ids.forEach(function(id) {
      allOrderIds.push(String(id));
    });

    lastId = String(listResponse.last_id || '').trim();

    // Защита от бесконечного цикла: пустая страница или тот же last_id.
    if (!ids.length || lastId === previousLastId) break;
    if (listPage >= 200) {
      throw new Error('Заявки на поставку: остановлено после 200 страниц.');
    }
    Utilities.sleep(250);
  } while (lastId);

  const bundleGroups = {};
  const metadataByCluster = {};

  for (let offset = 0; offset < allOrderIds.length; offset += 50) {
    const batch = allOrderIds.slice(offset, offset + 50);
    const getResponse = ozonRequest_(
      '/v3/supply-order/get',
      {order_ids: batch},
      apiKey
    );

    const orders = Array.isArray(getResponse.orders)
      ? getResponse.orders
      : [];

    orders.forEach(function(order) {
      const supplies = Array.isArray(order.supplies)
        ? order.supplies
        : [];

      supplies.forEach(function(supply) {
        const bundleId = String(supply.bundle_id || '').trim();
        const clusterId = String(supply.macrolocal_cluster_id || '').trim();
        if (!bundleId || !clusterId) return;

        if (!bundleGroups[clusterId]) {
          bundleGroups[clusterId] = {
            clusterId: clusterId,
            clusterName: '',
            bundleIds: [],
            orderIds: []
          };
        }

        bundleGroups[clusterId].bundleIds.push(bundleId);
        bundleGroups[clusterId].orderIds.push(String(order.order_id || ''));

        if (!metadataByCluster[clusterId]) {
          metadataByCluster[clusterId] = {
            orderNumbers: {},
            states: {}
          };
        }

        const orderNumber = String(order.order_number || order.order_id || '').trim();
        const state = String(supply.state || order.state || '').trim();

        if (orderNumber) metadataByCluster[clusterId].orderNumbers[orderNumber] = true;
        if (state) metadataByCluster[clusterId].states[state] = true;
      });
    });
  }

  // Отдельный запрос по ID нужен только для кластеров,
  // которых нет в уже загруженном общем списке.
  const exactClusterNames = loadClusterNamesByIds_(
    Object.keys(bundleGroups).filter(function(id) { return !clusterIdToApiName[id]; }),
    apiKey
  );

  Object.keys(bundleGroups).forEach(function(clusterId) {
    let apiName =
      exactClusterNames[clusterId] ||
      clusterIdToApiName[clusterId] ||
      '';

    let canonicalName = apiName
      ? matchWarehouseToCluster_(apiName, clusters)
      : '';

    if (!canonicalName && apiName) {
      const normalizedApiName = normalizeKey_(apiName);
      canonicalName = clusters.filter(function(cluster) {
        return normalizeKey_(cluster) === normalizedApiName;
      })[0] || '';
    }

    // Основной fallback: определяем целевой кластер через детали заявки.
    if (!canonicalName) {
      const orderIds = Array.from(
        new Set(bundleGroups[clusterId].orderIds.filter(Boolean))
      );

      for (let i = 0; i < orderIds.length; i++) {
        canonicalName = resolveOrderClusterFromDetails_(
          orderIds[i],
          clusters,
          apiKey
        );
        if (canonicalName) break;
      }
    }

    bundleGroups[clusterId].clusterName =
      canonicalName ||
      apiName ||
      'Кластер ' + clusterId;
  });

  const aggregated = {};

  Object.keys(bundleGroups).forEach(function(clusterId) {
    const group = bundleGroups[clusterId];
    const uniqueBundleIds = Array.from(new Set(group.bundleIds));

    for (let offset = 0; offset < uniqueBundleIds.length; offset += 100) {
      const batch = uniqueBundleIds.slice(offset, offset + 100);
      let bundleLastId = '';
      let bundlePage = 0;

      do {
        bundlePage++;
        const previousBundleLastId = bundleLastId;
        const bundleResponse = ozonRequest_(
          '/v1/supply-order/bundle',
          {
            bundle_ids: batch,
            is_asc: true,
            last_id: bundleLastId,
            limit: 100,
            query: '',
            sort_field: 'SKU'
          },
          apiKey
        );

        const items = Array.isArray(bundleResponse.items)
          ? bundleResponse.items
          : [];

        items.forEach(function(item) {
          const offerId = String(item.offer_id || '').trim();
          const quantity = Math.max(0, Number(item.quantity || 0));
          if (!offerId || quantity <= 0) return;

          const key = clusterId + '||' + offerId;
          if (!aggregated[key]) {
            aggregated[key] = {
              clusterId: clusterId,
              clusterName: group.clusterName,
              offerId: offerId,
              quantity: 0
            };
          }
          aggregated[key].quantity += quantity;
        });

        bundleLastId = bundleResponse.has_next
          ? String(bundleResponse.last_id || '').trim()
          : '';

        if (bundleLastId && (bundleLastId === previousBundleLastId || !items.length)) break;
        if (bundlePage >= 200) {
          throw new Error('Состав поставок: остановлено после 200 страниц.');
        }
      } while (bundleLastId);
    }
  });

  const rows = Object.keys(aggregated).map(function(key) {
    const item = aggregated[key];
    const metadata = metadataByCluster[item.clusterId] || {
      orderNumbers: {},
      states: {}
    };

    return [
      item.clusterName,
      item.offerId,
      item.quantity,
      item.clusterId,
      Object.keys(metadata.orderNumbers).join(', '),
      Object.keys(metadata.states).join(', ')
    ];
  });

  rows.sort(function(a, b) {
    const clusterCompare = String(a[0]).localeCompare(String(b[0]), 'ru');
    if (clusterCompare !== 0) return clusterCompare;
    return String(a[1]).localeCompare(String(b[1]), 'ru');
  });

  const sh = SpreadsheetApp.getActive().getSheetByName(OZON.TRANSIT_SHEET);
  const oldRows = Math.max(0, sh.getLastRow() - 1);
  if (oldRows) {
    sh.getRange(2, 1, oldRows, 6).clearContent();
  }

  if (rows.length) {
    sh.getRange(2, 1, rows.length, 6).setValues(rows);
  }

  const unresolvedClusters = Object.keys(bundleGroups).filter(function(id) {
    return String(bundleGroups[id].clusterName).indexOf('Кластер ') === 0;
  });

  sh.getRange('H1:I5').clearContent();
  sh.getRange('H1:I5').setValues([
    ['Обновлено', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm')],
    ['Активных заявок', allOrderIds.length],
    ['Кластеров с поставками', Object.keys(bundleGroups).length],
    ['Строк товаров', rows.length],
    ['Не распознано кластеров', unresolvedClusters.join(', ')]
  ]);
  sh.getRange('H1:H5').setFontWeight('bold');
}

function loadTransitByOfferCluster_(clusters) {
  ensureTransitSheet_();
  const sh = SpreadsheetApp.getActive().getSheetByName(OZON.TRANSIT_SHEET);
  const result = {};
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return result;

  const clusterMap = {};
  clusters.forEach(function(c) { clusterMap[normalizeKey_(c)] = c; });
  const rows = sh.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  rows.forEach(function(row) {
    const rawCluster = String(row[0] || '').trim();
    const offerId = String(row[1] || '').trim();
    const qty = Math.max(0, Number(String(row[2] || '0').replace(',', '.')) || 0);
    const clusterId = String(row[3] || '').trim();
    if (!rawCluster || !offerId || qty <= 0) return;

    let cluster =
      clusterMap[normalizeKey_(rawCluster)] ||
      matchWarehouseToCluster_(rawCluster, clusters);

    // Если в A осталось техническое имя, пытаемся сопоставить по уже
    // известным названиям на этом же листе с тем же ID.
    if (!cluster && clusterId) {
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][3] || '').trim() !== clusterId) continue;
        const candidate = String(rows[i][0] || '').trim();
        cluster =
          clusterMap[normalizeKey_(candidate)] ||
          matchWarehouseToCluster_(candidate, clusters);
        if (cluster) break;
      }
    }
    if (!cluster) return;
    if (!result[offerId]) result[offerId] = {};
    result[offerId][cluster] = (result[offerId][cluster] || 0) + qty;
  });
  return result;
}

/** Суммирует «в пути» по артикулам и записывает в G основной страницы. */
function syncTransitToMainSheet_() {
  ensureTransitSheet_();
  const main = getMainSheet_();
  const lastRow = getLastProductRow_(main);
  if (lastRow < OZON.DATA_START_ROW) return;

  const transitSheet = SpreadsheetApp.getActive().getSheetByName(OZON.TRANSIT_SHEET);
  const totals = {};
  if (transitSheet.getLastRow() >= 2) {
    transitSheet.getRange(2, 2, transitSheet.getLastRow() - 1, 2).getDisplayValues().forEach(function(row) {
      const offerId = String(row[0] || '').trim();
      const qty = Math.max(0, Number(String(row[1] || '0').replace(',', '.')) || 0);
      if (offerId && qty > 0) totals[offerId] = (totals[offerId] || 0) + qty;
    });
  }

  const offers = main.getRange(OZON.DATA_START_ROW, 1, lastRow - OZON.DATA_START_ROW + 1, 1).getDisplayValues();
  const values = offers.map(function(row) { return [totals[String(row[0] || '').trim()] || 0]; });
  main.getRange(OZON.DATA_START_ROW, 7, values.length, 1).setValues(values);
}

/** Собирает утверждённые пользователем значения из столбцов «План». */
function collectSupplyPlan() {
  try {
    const ss = SpreadsheetApp.getActive();
    const source = ss.getSheetByName(OZON.CLUSTER_SALES_SHEET);
    if (!source || source.getRange('A3').getDisplayValue() !== 'Артикул') {
      throw new Error('Сначала создайте и обновите кластерную таблицу.');
    }

    const lastCol = source.getLastColumn();
    const lastRow = source.getLastRow();
    const header1 = source.getRange(3, 1, 1, lastCol).getDisplayValues()[0];
    const header2 = source.getRange(4, 1, 1, lastCol).getDisplayValues()[0];
    const planCols = [];
    for (let col = 5; col <= lastCol; col++) {
      if (String(header2[col - 1] || '').trim() === 'План') {
        let cluster = '';
        for (let c = col; c >= 5; c--) {
          const value = String(header1[c - 1] || '').trim();
          if (value) { cluster = value; break; }
        }
        if (cluster) planCols.push({cluster: cluster, col: col});
      }
    }
    if (!planCols.length) throw new Error('Не найдены столбцы «План».');

    const rows = lastRow >= 5 ? source.getRange(5, 1, lastRow - 4, lastCol).getValues() : [];
    const byCluster = {};
    const totalByOffer = {};
    const offerOrder = [];

    planCols.forEach(function(p) { byCluster[p.cluster] = []; });

    rows.forEach(function(row) {
      const offerId = String(row[0] || '').trim();
      const name = String(row[1] || '').trim();
      if (!offerId) return;

      let totalQty = 0;

      planCols.forEach(function(p) {
        const qty = Math.max(0, Math.floor(Number(row[p.col - 1]) || 0));
        if (qty > 0) {
          byCluster[p.cluster].push({offerId: offerId, name: name, qty: qty});
          totalQty += qty;
        }
      });

      if (totalQty > 0) {
        if (!Object.prototype.hasOwnProperty.call(totalByOffer, offerId)) {
          offerOrder.push(offerId);
          totalByOffer[offerId] = 0;
        }
        totalByOffer[offerId] += totalQty;
      }
    });

    let target = ss.getSheetByName(OZON.PLAN_SHEET);
    if (!target) target = ss.insertSheet(OZON.PLAN_SHEET);

    const activeClusters = planCols.map(function(p) { return p.cluster; }).filter(function(c) {
      return byCluster[c] && byCluster[c].length;
    });

    // Полностью сбрасываем старую структуру листа перед повторной сборкой.
    const oldFilter = target.getFilter();
    if (oldFilter) oldFilter.remove();
    target.setFrozenRows(0);
    target.setFrozenColumns(0);
    target.getDataRange().breakApart();
    target.clear();
    target.clearConditionalFormatRules();

    if (!activeClusters.length) {
      target.getRange('A1').setValue('В столбцах «План» нет количества больше нуля.');
      return;
    }

    // На один кластер нужно 2 столбца данных и 1 пустой разделитель.
    const requiredColumns = Math.max(2, activeClusters.length * 3 - 1);
    const maxItems = activeClusters.reduce(function(maxValue, cluster) {
      return Math.max(maxValue, byCluster[cluster].length);
    }, 0);
    const summaryItems = offerOrder.length;
    const summaryStartRow = maxItems + 6;
    const requiredRows = Math.max(4, summaryStartRow + summaryItems + 2);

    if (target.getMaxColumns() < requiredColumns) {
      target.insertColumnsAfter(
        target.getMaxColumns(),
        requiredColumns - target.getMaxColumns()
      );
    }

    if (target.getMaxRows() < requiredRows) {
      target.insertRowsAfter(
        target.getMaxRows(),
        requiredRows - target.getMaxRows()
      );
    }

    let startCol = 1;
    activeClusters.forEach(function(cluster, index) {
      const items = byCluster[cluster];
      target.getRange(1, startCol, 1, 2).merge().setValue(cluster)
        .setBackground(index % 2 === 0 ? '#4472c4' : '#5b9bd5')
        .setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
      target.getRange(2, startCol, 1, 2).setValues([['Артикул', 'Количество']])
        .setBackground('#d9e2f3').setFontWeight('bold');
      const values = items.map(function(item) { return [item.offerId, item.qty]; });
      target.getRange(3, startCol, values.length, 2).setValues(values);
      const totalRow = 3 + values.length;
      target.getRange(totalRow, startCol, 1, 2).setValues([['Итого', items.reduce(function(a, x) { return a + x.qty; }, 0)]])
        .setFontWeight('bold').setBackground('#e2f0d9');
      target.setColumnWidth(startCol, 165);
      target.setColumnWidth(startCol + 1, 90);
      startCol += 3;
    });
    // Компактный общий итог по артикулам, отсортированный по артикулу.
    if (summaryItems > 0) {
      target.getRange(summaryStartRow, 1, 1, 2)
        .merge()
        .setValue('Итого по артикулам')
        .setBackground('#1f4e78')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');

      target.getRange(summaryStartRow + 1, 1, 1, 2)
        .setValues([['Артикул', 'Всего']])
        .setBackground('#d9e2f3')
        .setFontWeight('bold');

      const summaryValues = offerOrder.map(function(offerId) {
        return [offerId, totalByOffer[offerId]];
      }).sort(function(a, b) {
        return String(a[0]).localeCompare(String(b[0]), 'ru', {
          sensitivity: 'base'
        });
      });

      target.getRange(summaryStartRow + 2, 1, summaryValues.length, 2)
        .setValues(summaryValues);

      target.getRange(summaryStartRow + 2, 2, summaryValues.length, 1)
        .setNumberFormat('0');

      const grandTotal = summaryValues.reduce(function(sum, row) {
        return sum + Number(row[1] || 0);
      }, 0);

      target.getRange(summaryStartRow + 2 + summaryValues.length, 1, 1, 2)
        .setValues([['Всего', grandTotal]])
        .setFontWeight('bold')
        .setBackground('#e2f0d9');
    }

    target.setFrozenRows(2);
    target.getRange(1, 1, Math.max(2, target.getLastRow()), target.getLastColumn()).setVerticalAlignment('middle');
    target.activate();
    SpreadsheetApp.getUi().alert('План поставок собран. Внизу добавлен общий итог по артикулам.');
  } catch (error) {
    handleError_('Собрать план поставок', error);
  }
}
