-- Add the account-level profile phone without changing existing columns or relations.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
