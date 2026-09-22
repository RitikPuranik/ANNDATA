-- Google OAuth support: mobile/passwordHash become optional (a
-- Google-only signup has neither), and a nullable, unique googleId is
-- added to link an Anndata account to a Google account.

ALTER TABLE "users" ALTER COLUMN "mobile" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
