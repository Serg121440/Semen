import pytest

pytest.importorskip("pydantic_settings")

from app.core.config import Settings


def test_admin_ids_accepts_single_integer():
    settings = Settings(admin_ids=65874492)
    assert settings.admin_ids == (65874492,)


def test_admin_ids_accepts_list():
    settings = Settings(admin_ids=[65874492, 123456789])
    assert settings.admin_ids == (65874492, 123456789)
