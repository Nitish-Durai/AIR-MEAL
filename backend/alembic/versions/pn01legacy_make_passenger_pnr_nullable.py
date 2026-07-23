"""Make legacy passengers.pnr nullable and drop its unique constraint.

Booking references are authoritative on the bookings table, which boarding
queries and which enforces both surname and account ownership. The
passengers.pnr column predates that design and is no longer read anywhere;
registration previously had to invent a placeholder value purely to satisfy
NOT NULL and UNIQUE. Relaxing the column stops that, and removes the risk of
a future query resolving a booking against the non-authoritative table.

The column is retained rather than dropped so the change is reversible and
so existing rows keep their values.

Revision ID: pn01legacy
Revises: bk01booking
"""

from alembic import op
import sqlalchemy as sa

revision = "pn01legacy"
down_revision = "bk01booking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "passengers",
        "pnr",
        existing_type=sa.String(length=20),
        nullable=True,
    )
    op.drop_constraint("passengers_pnr_key", "passengers", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("passengers_pnr_key", "passengers", ["pnr"])
    op.alter_column(
        "passengers",
        "pnr",
        existing_type=sa.String(length=20),
        nullable=False,
    )
