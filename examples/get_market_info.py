from _bootstrap import build_services


def main() -> None:
    settings, market_service, _, _, _ = build_services()
    rules = market_service.get_instrument_rules(
        category=settings.default_category,
        symbol=settings.default_symbol,
    )
    print(f"symbol: {rules.symbol}")
    print(f"tickSize: {rules.tick_size}")
    print(f"qtyStep: {rules.qty_step}")
    print(f"minOrderQty: {rules.min_order_qty}")
    print(f"maxLeverage: {rules.max_leverage}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}")
