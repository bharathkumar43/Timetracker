#!/bin/sh
set -e

echo ">>> Running database migrations..."
npx prisma db push

echo ">>> Seeding default tasks..."
npx prisma db seed

echo ">>> Starting application on port 3300..."
exec npm run start
