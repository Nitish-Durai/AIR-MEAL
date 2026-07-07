"""add bookings table

Revision ID: bk01booking
Revises: pf01priority
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'bk01booking'
down_revision: Union[str, None] = 'pf01priority'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('bookings',
    sa.Column('pnr', sa.String(length=20), nullable=False),
    sa.Column('passenger_id', sa.Uuid(), nullable=False),
    sa.Column('flight_id', sa.Uuid(), nullable=False),
    sa.Column('seat_number', sa.String(length=10), nullable=False),
    sa.Column('cabin_class', sa.String(length=20), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['passenger_id'], ['passengers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['flight_id'], ['flights.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('pnr', name='uq_booking_pnr'),
    sa.UniqueConstraint('flight_id', 'seat_number', name='uq_booking_flight_seat')
    )
    op.create_index('ix_bookings_pnr', 'bookings', ['pnr'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_bookings_pnr', table_name='bookings')
    op.drop_table('bookings')
