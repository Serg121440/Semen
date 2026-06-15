from _bootstrap import build_services


def main() -> None:
    settings, _, _, position_service, _ = build_services()
    position = position_service.get_position_by_symbol(
        category=settings.default_category,
        symbol=settings.default_symbol,
    )
    if not position:
        print("No position found")
        return

    for field in (
        "side",
        "size",
        "avgPrice",
        "markPrice",
        "liqPrice",
        "leverage",
        "unrealisedPnl",
    ):
        print(f"{field}: {position.get(field)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}")
