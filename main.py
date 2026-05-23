"""
Фитнес-бот «Личный тренер»
Деплой: RelaxDev.ru (GitHub → переменные окружения → Deploy)
"""

import asyncio, json, os
from datetime import datetime, date
from pathlib import Path
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message
import anthropic

# ── Токены из переменных окружения (никогда не в коде!) ────
TG_TOKEN   = os.environ["TG_TOKEN"]      # задать в RelaxDev → Settings → Env Vars
CLAUDE_KEY = os.environ["CLAUDE_KEY"]    # задать там же

GOAL_CAL   = 1800
GOAL_PRO   = 180
GOAL_STEPS = 8000
DATA_FILE  = "diary_data.json"

USER_PROFILE = (
    "Мужчина 44 года, 100 кг, цель похудеть. "
    "Нет толстой кишки (резервуар, язвенный колит). Нельзя бегать. "
    "Тренировки дома: EZ-штанга, гантели 15кг, турник, брусья, резинки, колка дров. "
    "Цели: 1800 ккал/день, 180г белка, 8000+ шагов."
)

# ── Хранилище ──────────────────────────────────────────────
def load_data() -> dict:
    if Path(DATA_FILE).exists():
        return json.loads(Path(DATA_FILE).read_text(encoding="utf-8"))
    return {}

def save_data(data: dict):
    Path(DATA_FILE).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

def today_key() -> str:
    return date.today().isoformat()

def get_today(data: dict) -> dict:
    key = today_key()
    if key not in data:
        data[key] = {"entries": [], "steps": 0}
    return data[key]

def day_totals(day: dict) -> dict:
    cal = pro = fat = carb = 0
    for e in day.get("entries", []):
        cal  += e.get("kcal", 0)
        pro  += e.get("prot", 0)
        fat  += e.get("fat",  0)
        carb += e.get("carb", 0)
    return {"cal": cal, "pro": pro, "fat": fat, "carb": carb,
            "steps": day.get("steps", 0)}

# ── Claude ─────────────────────────────────────────────────
ai = anthropic.Anthropic(api_key=CLAUDE_KEY)

def ask_claude(prompt: str, max_tokens: int = 400) -> str:
    msg = ai.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text

def parse_food(text: str) -> dict:
    raw = ask_claude(
        f'Рассчитай КБЖУ: "{text}". '
        'Ответь ТОЛЬКО JSON без markdown: '
        '{"name":"название","kcal":число,"prot":число,"fat":число,"carb":число}',
        max_tokens=200
    )
    return json.loads(raw.strip().strip("```json").strip("```").strip())

def bar(value: int, goal: int, width: int = 10) -> str:
    filled = min(width, value * width // max(goal, 1))
    return "█" * filled + "░" * (width - filled)

def fmt_summary(t: dict) -> str:
    deficit = int(2500 + t["steps"] * 0.04 - t["cal"])
    return (
        f"📊 <b>Итог дня</b>\n\n"
        f"🔥 Калории  {t['cal']}/{GOAL_CAL} ккал\n"
        f"<code>{bar(t['cal'], GOAL_CAL)}</code>\n\n"
        f"🥩 Белок    {t['pro']}/{GOAL_PRO}г\n"
        f"<code>{bar(t['pro'], GOAL_PRO)}</code>\n\n"
        f"👟 Шаги     {t['steps']:,}/{GOAL_STEPS:,}\n"
        f"<code>{bar(t['steps'], GOAL_STEPS)}</code>\n\n"
        f"⚡️ Дефицит  {deficit} ккал\n"
        + ("✅ Отличный день!" if deficit >= 600 and t["pro"] >= 150
           else "💪 Продолжай!" if deficit >= 300
           else "⚠️ Дефицит маловат — добавь активности")
    )

# ── Handlers ───────────────────────────────────────────────
bot = Bot(token=TG_TOKEN, parse_mode="HTML")
dp  = Dispatcher()

@dp.message(Command("start", "помощь", "help"))
async def cmd_start(msg: Message):
    await msg.answer(
        "💪 <b>Привет, тренируемся!</b>\n\n"
        "Просто пиши мне:\n\n"
        "🍽 <code>съел шашлык из индейки 300г</code>\n"
        "👟 <code>шагов 10500</code>\n"
        "⚖️ <code>вес 98.5</code>\n"
        "🪓 <code>рубил дрова 30 минут</code>\n\n"
        "Команды:\n"
        "/итог — сводка дня\n"
        "/план — что съесть\n"
        "/тренировка — программа на сегодня\n"
        "/неделя — статистика за 7 дней"
    )

@dp.message(Command("итог"))
async def cmd_summary(msg: Message):
    data = load_data()
    t = day_totals(get_today(data))
    await msg.answer(fmt_summary(t))

@dp.message(Command("план"))
async def cmd_plan(msg: Message):
    data = load_data()
    t = day_totals(get_today(data))
    reply = ask_claude(
        f"{USER_PROFILE}\n\n"
        f"Сегодня съедено: {t['cal']} ккал, белок {t['pro']}г, шагов {t['steps']}.\n"
        f"Осталось: {GOAL_CAL - t['cal']} ккал, белка {GOAL_PRO - t['pro']}г.\n\n"
        "Дай 2-3 конкретных варианта что съесть на остаток дня с ккал и белком. "
        "Учти: нет толстой кишки, нельзя грубую клетчатку и бобовые. "
        "Короткий ответ по-русски."
    )
    await msg.answer(f"🍽 <b>План на остаток дня</b>\n\n{reply}")

@dp.message(Command("тренировка"))
async def cmd_workout(msg: Message):
    wd = datetime.now().weekday()
    schedule = {
        0: "Понедельник — А: Грудь, плечи, трицепс",
        1: "Вторник — Дрова + ходьба",
        2: "Среда — B: Спина, бицепс",
        3: "Четверг — Восстановление + ходьба",
        4: "Пятница — C: Ноги + кор",
        5: "Суббота — Дрова или ходьба",
        6: "Воскресенье — Полный отдых",
    }
    day_name = schedule.get(wd, "День отдыха")
    reply = ask_claude(
        f"{USER_PROFILE}\n\n"
        f"Сегодня {day_name}.\n"
        "Дай конкретную программу с упражнениями, подходами и весами. "
        "Инвентарь: EZ-штанга с блинами до 32кг, гантели 2×15кг, "
        "турник, брусья, резинки 20 и 40кг. "
        "По-русски, конкретно, с цифрами."
    )
    await msg.answer(f"🏋️ <b>{day_name}</b>\n\n{reply}")

@dp.message(Command("неделя"))
async def cmd_week(msg: Message):
    data = load_data()
    lines = []
    total_cal = total_pro = days = 0
    for i in range(6, -1, -1):
        from datetime import timedelta
        d = (date.today() - timedelta(days=i)).isoformat()
        if d in data:
            t = day_totals(data[d])
            ok = "✅" if t["cal"] <= GOAL_CAL and t["pro"] >= GOAL_PRO * 0.8 else "⚠️"
            lines.append(f"{ok} {d[-5:]}  {t['cal']} ккал  Б:{t['pro']}г  👟{t['steps']:,}")
            if t["cal"] > 0:
                total_cal += t["cal"]; total_pro += t["pro"]; days += 1
        else:
            lines.append(f"— {d[-5:]}  нет данных")
    avg = f"\n\n📈 Среднее: {total_cal//max(days,1)} ккал · Б:{total_pro//max(days,1)}г" if days else ""
    await msg.answer("<b>📅 Неделя</b>\n\n" + "\n".join(lines) + avg)

@dp.message()
async def cmd_any(msg: Message):
    text = msg.text.strip() if msg.text else ""
    if not text:
        return

    import re

    # Шаги
    if re.search(r'шаг', text, re.I):
        nums = re.findall(r'\d+', text)
        if nums:
            steps = int(nums[0])
            data = load_data(); day = get_today(data)
            day["steps"] = steps; save_data(data)
            emoji = "🏆" if steps >= GOAL_STEPS else "👟"
            await msg.answer(
                f"{emoji} Записал: <b>{steps:,} шагов</b>\n"
                + ("✅ Цель выполнена!" if steps >= GOAL_STEPS
                   else f"До цели: {GOAL_STEPS - steps:,} шагов")
            )
            return

    # Вес
    if re.search(r'^вес\b', text, re.I):
        nums = re.findall(r'[\d.]+', text)
        if nums:
            data = load_data(); day = get_today(data)
            day["weight"] = float(nums[0]); save_data(data)
            await msg.answer(f"⚖️ Вес записан: <b>{nums[0]} кг</b>")
            return

    # Дрова
    if re.search(r'дров|рубил|колол', text, re.I):
        nums = re.findall(r'\d+', text)
        mins = int(nums[0]) if nums else 30
        kcal = int(mins * 13)  # ~13 ккал/мин при 100кг
        data = load_data(); day = get_today(data)
        day["entries"].append({
            "name": f"Колка дров {mins} мин",
            "time": datetime.now().strftime("%H:%M"),
            "kcal": -kcal, "prot": 0, "fat": 0, "carb": 0
        })
        save_data(data)
        await msg.answer(
            f"🪓 Записал: колка дров {mins} мин\n"
            f"🔥 Сожжено ~{kcal} ккал дополнительно"
        )
        return

    # Вопрос
    question_starts = ["как", "что", "когда", "зачем", "почему", "можно",
                       "нужно", "сколько", "помоги", "расскажи"]
    is_q = "?" in text or any(text.lower().startswith(w) for w in question_starts)

    if is_q:
        data = load_data(); t = day_totals(get_today(data))
        reply = ask_claude(
            f"{USER_PROFILE}\n"
            f"Сегодня: {t['cal']} ккал, белок {t['pro']}г, шагов {t['steps']}.\n\n"
            f"Вопрос: {text}\n\n"
            "Ответь конкретно, по-русски, 2-4 предложения."
        )
        await msg.answer(f"🤔 {reply}")
        return

    # Иначе — еда
    await msg.answer("⏳ Считаю КБЖУ...")
    try:
        food = parse_food(text)
        data = load_data(); day = get_today(data)
        food["time"] = datetime.now().strftime("%H:%M")
        day["entries"].append(food); save_data(data)
        t = day_totals(day)

        rem = GOAL_CAL - t["cal"]
        tip = ""
        if t["cal"] > GOAL_CAL:
            tip = f"\n⚠️ Превышение на {t['cal'] - GOAL_CAL} ккал"
        elif rem < 300:
            tip = f"\n💡 Осталось всего {rem} ккал — лёгкий ужин"
        elif t["pro"] < GOAL_PRO * 0.5 and t["cal"] > 500:
            tip = "\n⚠️ Маловато белка — добавь творог или мясо"

        await msg.answer(
            f"✅ <b>{food['name']}</b>\n"
            f"🔥 {food['kcal']} ккал  "
            f"Б:{food['prot']}г  Ж:{food.get('fat',0)}г  У:{food.get('carb',0)}г\n\n"
            f"<i>День: {t['cal']} ккал · белок {t['pro']}г · шагов {t['steps']:,}</i>"
            f"{tip}"
        )
    except Exception:
        await msg.answer(
            "Не смог распознать 🤔\n"
            "Попробуй: <code>съел 300г куриной грудки</code>"
        )

async def main():
    print("🚀 Бот запущен")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
