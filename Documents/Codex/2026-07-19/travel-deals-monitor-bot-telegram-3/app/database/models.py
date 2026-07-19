from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    departure_city: Mapped[str] = mapped_column(String(80), default="Москва")
    adults: Mapped[int] = mapped_column(Integer, default=2)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    min_days: Mapped[int] = mapped_column(default=3)
    max_days: Mapped[int] = mapped_column(default=4)
    max_stops: Mapped[int] = mapped_column(default=1)
    max_travel_minutes: Mapped[int] = mapped_column(default=600)
    visa_free_only: Mapped[bool] = mapped_column(Boolean, default=True)
    countries: Mapped[str] = mapped_column(Text, default="Турция,Сербия,Черногория,Армения,Грузия,Азербайджан")
    excluded: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    favorites: Mapped[list["Favorite"]] = relationship(back_populates="user")


class Deal(Base):
    __tablename__ = "deals"
    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    source: Mapped[str] = mapped_column(String(50), index=True)
    destination: Mapped[str] = mapped_column(String(120), index=True)
    country: Mapped[str] = mapped_column(String(80))
    departure_date: Mapped[date] = mapped_column(Date)
    return_date: Mapped[date] = mapped_column(Date)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    market_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    airline: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stops: Mapped[int] = mapped_column(default=0)
    travel_minutes: Mapped[int | None] = mapped_column(nullable=True)
    baggage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hotel: Mapped[str | None] = mapped_column(String(160), nullable=True)
    hotel_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    meal: Mapped[str | None] = mapped_column(String(80), nullable=True)
    url: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(Float, default=0)
    is_super_price: Mapped[bool] = mapped_column(Boolean, default=False)
    found_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "deal_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"))
    user: Mapped[User] = relationship(back_populates="favorites")


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    kind: Mapped[str] = mapped_column(String(30))
    reference: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class DealDelivery(Base):
    __tablename__ = "deal_deliveries"
    __table_args__ = (UniqueConstraint("user_id", "deal_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    deal_id: Mapped[int] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), index=True)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
