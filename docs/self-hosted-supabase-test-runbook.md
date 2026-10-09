# Тестовый контур self-hosted Supabase

Статус: подготовка. Команды запуска запрещено выполнять на production без отдельного GO.

## Стоимость этапа

- подготовка файлов и локальное ревью: 0 ₽;
- закрытый тест на текущем сервере: 0 ₽ дополнительной аренды;
- внешний S3 backup перед production-переходом: ориентир 349 ₽/месяц за 100 ГБ;
- переход на тариф Timeweb за 13 600 ₽/месяц не требуется.

## Выбранная версия

Managed Supabase использует PostgreSQL 17.6. Официальный self-hosted Supabase сейчас также использует PostgreSQL 17 по умолчанию. Для первого теста закреплён image `supabase/postgres:17.6.1.136` из upstream commit `6119ea1eb51005a5c6e172c75bcc954c622ff4cd`.

## Сервисы первого контура

Запускаются:

- PostgreSQL;
- GoTrue/Auth;
- PostgREST;
- Envoy API gateway;
- postgres-meta;
- Studio, доступная только через loopback/SSH tunnel.

Не запускаются:

- Realtime;
- Storage;
- imgproxy;
- Edge Functions;
- Supavisor.

Они не используются текущим кодом и отключены profile `unused`.

## Подготовка upstream

Планируемый путь на сервере: `/opt/artrest-supabase`.

Команды ниже являются планом и пока не выполняются:

```bash
sudo git clone https://github.com/supabase/supabase.git /opt/artrest-supabase-upstream
sudo git -C /opt/artrest-supabase-upstream checkout 6119ea1eb51005a5c6e172c75bcc954c622ff4cd
sudo cp -a /opt/artrest-supabase-upstream/docker /opt/artrest-supabase
```

После этого в `/opt/artrest-supabase` копируется `infra/supabase/compose.artrest.override.yml`.

## Secrets

1. Взять официальный `/opt/artrest-supabase/.env.example`.
2. Сгенерировать новые secrets официальными Supabase scripts.
3. Применить значения из `infra/supabase/config.env.example`, кроме `CHANGE_ME`.
4. SMTP credentials переносить только через закрытый root-readable env-файл.
5. Не использовать текущий managed Supabase JWT secret, даже если он станет доступен.
6. Не выводить secrets в терминал, логи, Git или отчёт.

## Проверка Compose до запуска

```bash
cd /opt/artrest-supabase
docker compose \
  -f docker-compose.yml \
  -f compose.artrest.override.yml \
  --env-file .env \
  config --quiet

docker compose \
  -f docker-compose.yml \
  -f compose.artrest.override.yml \
  --env-file .env \
  config --profiles
```

API gateway должен публиковаться только на `127.0.0.1:54321`. PostgreSQL не должен иметь host port.

## Запуск тестового контура

Только после отдельного GO:

```bash
cd /opt/artrest-supabase
docker compose \
  -f docker-compose.yml \
  -f compose.artrest.override.yml \
  --env-file .env \
  up -d db auth rest meta studio api-gw
```

Эта команда не меняет существующие контейнеры приложения, если используется отдельный project name `artrest-supabase`.

## Экспорт managed Supabase

Нужна временная connection string из Supabase Dashboard. Она не сохраняется в shell history и Git.

Официальная последовательность:

```bash
supabase db dump --db-url "$SOURCE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SOURCE_DB_URL" -f schema.sql
supabase db dump --db-url "$SOURCE_DB_URL" -f data.sql --use-copy --data-only
```

Dump содержит персональные данные и должен храниться только в каталоге с доступом root. После подтверждённого backup и окончания миграции временные файлы удаляются отдельным согласованным действием.

## Восстановление

В тестовом контуре PostgreSQL не публикуется наружу. Restore выполняется через `docker exec`/локальный socket контейнера и с `ON_ERROR_STOP=1`.

Сначала выполняется пробное восстановление. При любой ошибке процесс останавливается; SQL не исправляется автоматически и production не переключается.

После восстановления выполняется `infra/supabase/post-restore-checks.sql`. Контрольные counts сравниваются с managed Supabase.

## Тест приложения

Отдельная тестовая сборка приложения получает новые значения:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`.

Текущий production app и `.env.production` не меняются.

Проверяются:

1. Вход существующего пользователя после повторной авторизации.
2. Регистрация и письмо подтверждения.
3. Сброс пароля.
4. Загрузка и сохранение профиля.
5. Список ресторанов и слотов.
6. Создание и отмена отклика.
7. Доступ superadmin, HR и restaurant admin.
8. Activity tracking.
9. Отсутствие публичного anon-доступа к закрытым таблицам.

## STOP

Работы прекращаются, если:

- Compose публикует PostgreSQL или Studio в интернет;
- restore завершился с ошибкой;
- не совпало число Auth users или ключевых строк;
- отсутствуют нужные extensions;
- RLS отличается от managed проекта;
- SMTP не отправляет confirmation/reset;
- доступная память опустилась ниже 3 ГБ;
- свободное место на диске опустилось ниже 30 ГБ.

