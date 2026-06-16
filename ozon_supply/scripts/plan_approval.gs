/**
 * Ozon Supply — скрипт утверждения плана поставки.
 * Установка: Extensions → Apps Script → вставить этот код → Save → Run onOpen один раз.
 *
 * Функции:
 *   onOpen()          — добавляет меню «📦 Поставка» при открытии таблицы
 *   approveAll()      — ставит ✅ Утверждено всем кластерам
 *   resetAll()        — сбрасывает все статусы в ⏳ Ожидает
 *   onEdit(e)         — при изменении Правка_шт подсвечивает строку жёлтым
 */

const PLAN_VIEW_SHEET = "Просмотр_плана";
const STATUS_COL      = 10;   // колонка J — статус кластера
const EDIT_COL        = 6;    // колонка F — Правка_шт
const STATUS_CLUSTER_MARKER = "CLUSTER_ROW"; // метка в колонке K (скрыта)

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📦 Поставка Ozon")
    .addItem("✅ Утвердить всё",        "approveAll")
    .addItem("❌ Отклонить всё",        "rejectAll")
    .addItem("⏳ Сбросить статусы",     "resetAll")
    .addSeparator()
    .addItem("🔄 Применить правки шт",  "applyEdits")
    .addToUi();
}

function _getViewSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(PLAN_VIEW_SHEET);
  if (!ws) throw new Error("Лист «" + PLAN_VIEW_SHEET + "» не найден");
  return ws;
}

function _setClusterStatuses(status) {
  const ws = _getViewSheet();
  const data = ws.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    // Строки кластера помечены маркером в колонке K (индекс 10)
    if (data[i][10] === "CLUSTER_ROW") {
      ws.getRange(i + 1, STATUS_COL).setValue(status);
    }
  }
}

function approveAll()  { _setClusterStatuses("✅ Утверждено"); }
function rejectAll()   { _setClusterStatuses("❌ Отклонено");  }
function resetAll()    { _setClusterStatuses("⏳ Ожидает");    }

/**
 * При изменении ячейки Правка_шт:
 * — подсвечивает строку жёлтым (пользователь изменил)
 * — если очищена — снимает подсветку
 */
function onEdit(e) {
  const ws = e.range.getSheet();
  if (ws.getName() !== PLAN_VIEW_SHEET) return;
  if (e.range.getColumn() !== EDIT_COL) return;

  const row = e.range.getRow();
  const val = e.range.getValue();
  const rowRange = ws.getRange(row, 1, 1, 9);

  if (val !== "" && !isNaN(val) && Number(val) > 0) {
    rowRange.setBackground("#fff9c4");  // жёлтый — есть правка
  } else {
    // Восстанавливаем исходный цвет — читаем маркер строки из col L (индекс 11)
    const marker = ws.getRange(row, 12).getValue();
    rowRange.setBackground(marker === "CRITICAL" ? "#fce4ec" : "#ffffff");
  }
}

/**
 * applyEdits — копирует Правка_шт в Шт_план для утверждённых кластеров.
 * После этого значения Правка_шт очищаются.
 */
function applyEdits() {
  const ws = _getViewSheet();
  const data = ws.getDataRange().getValues();
  let inApproved = false;
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    const marker = data[i][10]; // col K
    if (marker === "CLUSTER_ROW") {
      inApproved = (data[i][STATUS_COL - 1] === "✅ Утверждено");
      continue;
    }
    if (!inApproved || marker !== "ITEM_ROW") continue;

    const editVal = data[i][EDIT_COL - 1]; // col F = Правка_шт
    if (editVal !== "" && !isNaN(editVal) && Number(editVal) > 0) {
      ws.getRange(i + 1, 5).setValue(Number(editVal));  // col E = Шт_план
      ws.getRange(i + 1, EDIT_COL).clearContent();
      ws.getRange(i + 1, 1, 1, 9).setBackground("#e8f5e9"); // зелёный — применено
      count++;
    }
  }
  SpreadsheetApp.getUi().alert("Применено правок: " + count);
}
