# Ozon Supply Assistant

Автоматизация формирования заявок на поставку FBO Ozon для ИП Сергашов / ИП Лебедев.

## Быстрый старт

```bash
cd /opt/ozon_supply
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Заполнить .env: API-ключи Ozon, токен Telegram, путь к service_account.json

# Проверка сбора данных
python -m src.main --collect

# Недельный расчёт плана
python -m src.main --run weekly

# Тесты
pytest tests/
```

## Структура

| Модуль | Назначение |
|---|---|
| `src/sources/orders_csv.py` | Парсинг CSV «Заказы» из ЛК Ozon |
| `src/sources/stocks_ozon.py` | Остатки FBO через `/v1/analytics/stocks` |
| `src/sources/stocks_factory.py` | Парсинг иерархического xlsx 1С |
| `src/sources/catalog.py` | Справочник SKU из Google Sheet |
| `src/logic/velocity.py` | Средние продажи/день × кластер |
| `src/logic/demand.py` | Расчёт дефицита и объёма заявки |
| `src/logic/allocation.py` | Распределение при нехватке в цеху |
| `src/sinks/gsheet_plan.py` | Запись в лист `План_заявок` |
| `src/sinks/telegram_bot.py` | Telegram-уведомления |
| `src/sinks/apps_script_handoff.py` | Перенос одобренных строк в «Состав ГМ» |

## Cron (сервер, UTC+3 = MSK)

```cron
# Понедельник 09:00 МСК
0 6 * * 1 cd /opt/ozon_supply && .venv/bin/python -m src.main --run weekly >> logs/cron.log 2>&1

# Ежедневно 08:00 МСК — алерт по критичным остаткам
0 5 * * * cd /opt/ozon_supply && .venv/bin/python -m src.main --run daily-alert >> logs/cron.log 2>&1
```

## Google Sheet

ID: `1nLyxuX1W_GSn-GkuiLgea-_QErB8cqkSYqv1UrZwBF8`

Листы: `Справочник_SKU`, `Остатки_цех_текущие`, `План_заявок`, `Лог_расчётов`, `Маппинг_складов`.

## Этапы

- [x] **0** Скелет проекта
- [ ] **1** Справочник SKU + маппинг (БЛОКЕР)
- [ ] **2** Сбор данных (orders CSV, stocks API, factory xlsx)
- [ ] **3** Логика расчёта + тесты
- [ ] **4** Вывод в Google Sheet + Telegram + Apps Script handoff
- [ ] **5** Авто-создание заявок через API (после 5 успешных циклов)
