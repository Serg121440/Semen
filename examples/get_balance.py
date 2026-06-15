from _bootstrap import build_services


def main() -> None:
    settings, _, account_service, _, _ = build_services()
    balance = account_service.get_available_balance(
        coin="USDT",
        account_type=settings.account_type,
    )
    print(f"USDT available balance: {balance}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}")
