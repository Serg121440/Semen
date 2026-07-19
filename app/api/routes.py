from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Deal, Source, User
from app.database.session import get_session

router = APIRouter()


class SourceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    kind: str = Field(pattern="^(telegram|tour|flight)$")
    reference: str
    enabled: bool = True


class UserSettingsUpdate(BaseModel):
    departure_city: str | None = Field(default=None, min_length=2, max_length=80)
    adults: int | None = Field(default=None, ge=1, le=10)
    budget: float | None = Field(default=None, gt=0)
    min_days: int | None = Field(default=None, ge=1, le=30)
    max_days: int | None = Field(default=None, ge=1, le=30)
    max_stops: int | None = Field(default=None, ge=0, le=3)
    max_travel_minutes: int | None = Field(default=None, ge=30, le=2880)
    visa_free_only: bool | None = None
    countries: str | None = None
    excluded: str | None = None


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/deals")
async def deals(limit: int = 20, session: AsyncSession = Depends(get_session)):
    return (await session.scalars(select(Deal).order_by(desc(Deal.score)).limit(min(limit, 100)))).all()


@router.get("/users/{telegram_id}")
async def user_settings(telegram_id: int, session: AsyncSession = Depends(get_session)):
    user = await session.scalar(select(User).where(User.telegram_id == telegram_id))
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.patch("/users/{telegram_id}")
async def update_user_settings(
    telegram_id: int, payload: UserSettingsUpdate, session: AsyncSession = Depends(get_session)
):
    user = await session.scalar(select(User).where(User.telegram_id == telegram_id))
    if not user:
        raise HTTPException(404, "User not found")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("min_days", user.min_days) > changes.get("max_days", user.max_days):
        raise HTTPException(422, "min_days must not exceed max_days")
    for key, value in changes.items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/admin/sources", status_code=201)
async def add_source(payload: SourceCreate, session: AsyncSession = Depends(get_session)):
    source = Source(**payload.model_dump())
    session.add(source)
    await session.commit()
    await session.refresh(source)
    return source


@router.get("/admin/sources")
async def list_sources(session: AsyncSession = Depends(get_session)):
    return (await session.scalars(select(Source).order_by(Source.name))).all()


@router.patch("/admin/sources/{source_id}/toggle")
async def toggle_source(source_id: int, session: AsyncSession = Depends(get_session)):
    source = await session.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    source.enabled = not source.enabled
    await session.commit()
    await session.refresh(source)
    return source


@router.delete("/admin/sources/{source_id}", status_code=204)
async def delete_source(source_id: int, session: AsyncSession = Depends(get_session)) -> None:
    source = await session.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    await session.delete(source)
    await session.commit()
