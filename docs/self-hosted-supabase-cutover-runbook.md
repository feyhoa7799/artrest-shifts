# Финальный cutover на self-hosted Supabase

Статус: подготовлено, не выполнено.

Этот runbook не является разрешением на переключение production. Начинать
техническое окно можно только после отдельного сообщения владельца
`GO: выполнить Supabase cutover`.

Все команды на сервере выполняются из root-shell, открытого командой
`sudo -i`. Это исключает случайное отсутствие доступа к `/root` и `/opt`.

## Итоговая топология

- сайт: `https://podrabotka.art-rest.com`;
- публичный Supabase API: `https://podrabotka.art-rest.com/supabase`;
- внутренний API приложения: `http://api-gw:8000`;
- loopback API gateway: `127.0.0.1:54321`;
- PostgreSQL не имеет host port;
- managed Supabase остаётся доступным для rollback минимум 14 дней;
- encrypted Restic backup хранится в приватном Timeweb S3 в РФ.

Новый DNS record не нужен. nginx снимает префикс `/supabase` при передаче
запроса в Envoy. До production окна этот вариант обязательно проверяется на
тестовом контуре для login, refresh token, email verify, recovery и REST.

## Обязательные блокеры

Cutover запрещён, пока не выполнено всё ниже:

1. PR #12 синхронизирован с актуальным `main`, прошёл ESLint, TypeScript и
   Docker build и всё ещё не merge.
2. В Yandex SmartCaptcha разрешён домен `podrabotka.art-rest.com`.
3. В production подготовлены, но не выведены в лог:
   `NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_SITE_KEY` и
   `YANDEX_SMARTCAPTCHA_SERVER_KEY`.
4. SMTP self-hosted Auth прошёл confirmation и recovery smoke-test.
5. Последний Restic snapshot успешен, `restic check` завершён без ошибок.
6. Доступна актуальная строка подключения managed Supabase для финального dump.
7. В Supabase SQL Editor выполнен `infra/supabase/cutover-inventory.sql`, вывод
   сохранён без содержимого строк.
8. Подтверждено техническое окно. Во время финального dump любые записи
   блокируются.

## Почему Telegram входит в окно

`telegram-bot` не удаляется этим релизом, но он читает и пишет таблицы
`telegram_*`. Оставить его на managed Supabase после переключения сайта нельзя:
получится две расходящиеся базы. На время финального dump бот останавливается,
а после успешного cutover запускается с новым `SUPABASE_URL` и service-role key.
Удаление Telegram выполняется позже отдельным PR.

## Фаза 0. Preflight, только чтение

```bash
cd /root/artrest-shifts

git status --short --branch
git rev-parse HEAD
git rev-parse origin/main

docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
curl -fsS -o /dev/null -w 'public=%{http_code}\n' https://podrabotka.art-rest.com/
curl -fsS -o /dev/null -w 'local=%{http_code}\n' http://127.0.0.1:8080/

sudo systemctl status artrest-supabase-backup.timer --no-pager
sudo systemctl list-timers artrest-supabase-backup.timer --no-pager
```

Зафиксировать без вывода секретов:

```bash
ROLLBACK_COMMIT=$(git rev-parse HEAD)
ROLLBACK_APP_IMAGE=$(docker inspect artrest-shifts-app --format '{{.Image}}')
ROLLBACK_BOT_IMAGE=$(docker inspect artrest-shifts-telegram-bot --format '{{.Image}}')
ENV_SHA256=$(sudo sha256sum .env.production | awk '{print $1}')
NGINX_SHA256=$(sudo sha256sum /etc/nginx/sites-enabled/podrabotka.art-rest.com | awk '{print $1}')
TS=$(date +%Y%m%d-%H%M%S)
EXPORT_DIR="/opt/artrest-supabase-cutover-$TS"
CUTOVER_STATE=/root/.artrest-supabase-cutover.state

printf 'ROLLBACK_COMMIT=%s\nAPP_IMAGE=%s\nBOT_IMAGE=%s\nENV_SHA256=%s\nNGINX_SHA256=%s\n' \
  "$ROLLBACK_COMMIT" "$ROLLBACK_APP_IMAGE" "$ROLLBACK_BOT_IMAGE" \
  "$ENV_SHA256" "$NGINX_SHA256"

umask 077
printf 'TS=%q\nEXPORT_DIR=%q\nROLLBACK_COMMIT=%q\nROLLBACK_APP_IMAGE=%q\nROLLBACK_BOT_IMAGE=%q\n' \
  "$TS" "$EXPORT_DIR" "$ROLLBACK_COMMIT" "$ROLLBACK_APP_IMAGE" \
  "$ROLLBACK_BOT_IMAGE" > "$CUTOVER_STATE"
```

Перед каждой следующей фазой выполнять
`source /root/.artrest-supabase-cutover.state`. Файл не содержит ключей или
паролей, но остаётся root-only.

STOP, если Git dirty, сайт не отвечает 200, любой Supabase container unhealthy,
backup timer не active или свободного места меньше 30 ГБ.

## Фаза 1. Backup self-hosted кандидата

Перед заменой текущей тестовой копии выполнить немедленный backup и проверить
snapshot. Это не заменяет финальный dump managed источника.

```bash
sudo systemctl start artrest-supabase-backup.service
sudo systemctl status artrest-supabase-backup.service --no-pager

sudo bash -lc '
  set -a
  source /etc/artrest-supabase-backup.env
  set +a
  restic snapshots --latest 1 --tag artrest-supabase
  restic check
'
```

STOP при любой ошибке.

## Фаза 2. Подготовить финальный dump managed Supabase

Создать root-only файл, открыть его через `sudoedit` и вручную добавить одну
строку `SOURCE_DB_URL=...`. Строку подключения нельзя передавать в чат или
командную строку.

```bash
source /root/.artrest-supabase-cutover.state
sudo install -d -m 0700 "$EXPORT_DIR"
sudo install -m 0600 /dev/null /root/.artrest-managed-source.env
sudoedit /root/.artrest-managed-source.env
```

До остановки записей разрешено проверить только подключение и версию. Сам
финальный dump выполняется после Фазы 3.

## Фаза 3. Начало технического окна и freeze

1. Скопировать подготовленную maintenance-конфигурацию из репозитория.
2. Выполнить `nginx -t`.
3. Только при успешном тесте выполнить `systemctl reload nginx`.
4. Остановить только Telegram-бот:

```bash
source /root/.artrest-supabase-cutover.state
cd /root/artrest-shifts
cp -a /etc/nginx/sites-available/podrabotka.art-rest.com \
  "/etc/nginx/sites-available/podrabotka.art-rest.com.pre-supabase-$TS"
install -m 0644 infra/nginx/podrabotka.art-rest.com.maintenance.conf \
  /etc/nginx/sites-available/podrabotka.art-rest.com
nginx -t
systemctl reload nginx

docker compose --env-file .env.production stop telegram-bot
docker ps --format "table {{.Names}}\t{{.Status}}"
```

С этого момента пользователи не могут создавать новые данные, а бот не пишет в
managed Supabase. Не продолжать, если maintenance mode не подтверждён внешним
HTTP 503 или бот остался запущен.

## Фаза 4. Финальный dump managed Supabase

Используется та же проверенная версия Supabase CLI `2.120.0`:

```bash
sudo bash -lc '
  set -euo pipefail
  set -a
  source /root/.artrest-managed-source.env
  set +a
  cd "'"$EXPORT_DIR"'"
  npx --yes supabase@2.120.0 db dump --db-url "$SOURCE_DB_URL" -f roles.sql --role-only
  npx --yes supabase@2.120.0 db dump --db-url "$SOURCE_DB_URL" -f schema.sql
  npx --yes supabase@2.120.0 db dump --db-url "$SOURCE_DB_URL" -f data.sql --use-copy --data-only
  sha256sum roles.sql schema.sql data.sql > SHA256SUMS
  sha256sum --check SHA256SUMS
'
```

После dump снова выполнить `cutover-inventory.sql` в managed SQL Editor. Counts
должны соответствовать dump-моменту. STOP при любой ошибке CLI или checksum.

## Фаза 5. Чистая подготовка self-hosted БД

Старый data-каталог не удаляется. Он сохраняется как локальный DB rollback.

```bash
source /root/.artrest-supabase-cutover.state
cd /opt/artrest-supabase
DB_ROLLBACK_DIR="/opt/artrest-supabase/volumes/db/data.pre-cutover-$TS"

docker compose -f docker-compose.yml -f compose.artrest.override.yml \
  --env-file .env stop studio meta rest auth api-gw db

sudo mv /opt/artrest-supabase/volumes/db/data "$DB_ROLLBACK_DIR"
sudo install -d -m 0700 /opt/artrest-supabase/volumes/db/data

docker compose -f docker-compose.yml -f compose.artrest.override.yml \
  --env-file .env up -d db
```

Дождаться `healthy`. Затем сверить свежий dump с фактической схемой образа.
Managed Auth ранее содержал nullable `auth.one_time_tokens.expires_at`, а
некоторые новые пустые Auth/Storage-таблицы отсутствовали в pinned self-hosted
образе. Допустима только уже проверенная совместимость:

- добавить nullable `expires_at`, если колонка есть в dump и отсутствует в цели;
- исключить из производной `data.filtered.sql` только `COPY`-блоки таблиц,
  которых нет в цели и для которых в fresh source inventory подтверждено 0 строк;
- оригинальный `data.sql` и checksums не изменять;
- любое непустое несовпадение означает STOP.

Restore выполняется с `ON_ERROR_STOP=1`. Предыдущий restore подтвердил, что
операции с `vault.secrets` нужно выполнять ролью `supabase_admin`, а не обычным
`postgres`.

```bash
sudo cat "$EXPORT_DIR/roles.sql" | docker exec -i supabase-db \
  psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
sudo cat "$EXPORT_DIR/schema.sql" | docker exec -i supabase-db \
  psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
sudo cat "$EXPORT_DIR/data.filtered.sql" | docker exec -i supabase-db \
  psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
```

Не создавать `data.filtered.sql` автоматически, пока fresh inventory не
проверен человеком. Если фильтрация не нужна, использовать неизменённый
`data.sql`.

Запустить остальные self-hosted сервисы только после успешного restore:

```bash
cd /opt/artrest-supabase
docker compose -f docker-compose.yml -f compose.artrest.override.yml \
  --env-file .env up -d auth rest meta studio api-gw
```

## Фаза 6. Post-restore проверки

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -fsS -o /dev/null -w 'gateway=%{http_code}\n' http://127.0.0.1:54321/auth/v1/health
```

Выполнить `infra/supabase/cutover-inventory.sql` в target через `psql` и
сравнить с source построчно. Также проверить:

- `auth.users`, `auth.identities` и число password hashes совпадают;
- counts всех public-таблиц совпадают;
- RLS, policies, functions и triggers совпадают;
- anon не читает закрытые таблицы;
- service role читает необходимые таблицы;
- login существующего тестового пользователя проходит через внутренний gateway.

STOP при любом расхождении. Не merge PR #12 и не менять production env.

## Фаза 7. Подготовить nginx и env

Скопировать текущий env для rollback. Nginx backup уже создан при включении
maintenance mode:

```bash
source /root/.artrest-supabase-cutover.state
cd /root/artrest-shifts
sudo cp -a .env.production ".env.production.pre-supabase-$TS"
```

В `/opt/artrest-supabase/.env` установить без вывода значений:

```text
SUPABASE_PUBLIC_URL=https://podrabotka.art-rest.com/supabase
API_EXTERNAL_URL=https://podrabotka.art-rest.com/supabase/auth/v1
SITE_URL=https://podrabotka.art-rest.com
ADDITIONAL_REDIRECT_URLS=https://podrabotka.art-rest.com/**
ENABLE_PHONE_SIGNUP=false
```

Пересоздать только `auth` после проверки diff переменных. Затем тестовым
локальным proxy проверить email links и callback URL.

В `.env.production` заменить только:

```text
NEXT_PUBLIC_SUPABASE_URL=https://podrabotka.art-rest.com/supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=<self-hosted anon key>
SUPABASE_URL=https://podrabotka.art-rest.com/supabase
SUPABASE_INTERNAL_URL=http://api-gw:8000
SUPABASE_SERVICE_ROLE_KEY=<self-hosted service-role key>
NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_SITE_KEY=<configured site key>
YANDEX_SMARTCAPTCHA_SERVER_KEY=<configured server key>
APP_BASE_URL=https://podrabotka.art-rest.com
```

Секреты вводятся только через `sudoedit`; значения не печатаются. Проверить
наличие и JWT claims маленьким скриптом, который выводит только boolean,
`role` и `ref`, без полного токена.

Финальная nginx-конфигурация уже подготовлена. До reload проверить:

```bash
install -m 0644 infra/nginx/podrabotka.art-rest.com.self-hosted.conf \
  /etc/nginx/sites-available/podrabotka.art-rest.com
nginx -t
```

Она публикует только необходимые Auth/REST операции: прямые `otp`, `recover`,
`signup`, Auth admin API и все `/token` grants кроме `refresh_token` возвращают
404. Password login выполняется только серверным route после SmartCaptcha.

Пока maintenance mode активен, публичный gateway не открывать.

## Фаза 8. Merge PR #12 и deploy

Только после всех DB и gateway проверок:

1. Проверить PR #12: open, mergeable, ожидаемый head, checks успешны.
2. Merge обычным merge commit, не squash и не rebase.
3. Обновить production checkout.
4. Build/recreate только `app`.
5. Затем recreate `telegram-bot`, чтобы он получил новый URL/key.

```bash
cd /root/artrest-shifts
git fetch origin main
git switch main
git pull --ff-only

docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d --no-deps app
docker compose --env-file .env.production up -d --no-deps --force-recreate telegram-bot
```

После успешного запуска атомарно включить финальный nginx config, выполнить
`nginx -t`, reload и отключить maintenance mode.

## Фаза 9. Автоматический и ручной smoke-test

Автоматически:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
curl -I --max-time 20 https://podrabotka.art-rest.com/
curl -I --max-time 20 https://podrabotka.art-rest.com/admin
curl -I --max-time 20 https://podrabotka.art-rest.com/supabase/auth/v1/health

# Прямой обход CAPTCHA должен быть закрыт.
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST https://podrabotka.art-rest.com/supabase/auth/v1/otp
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST 'https://podrabotka.art-rest.com/supabase/auth/v1/token?grant_type=password'

docker logs --tail=200 artrest-shifts-app
docker logs --tail=120 artrest-shifts-telegram-bot
```

Ожидается 404 для двух прямых Auth-операций. Затем вручную проверить:

1. вход существующего сотрудника через Yandex SmartCaptcha;
2. refresh сессии после перезагрузки;
3. регистрацию и email confirmation;
4. recovery/reset password;
5. профиль, список слотов, отклик и отмену;
6. superadmin `/admin`;
7. restaurant admin scoped access;
8. activity ping;
9. один безопасный тест Telegram link/notification, если бот ещё используется.

После smoke-test запустить немедленный Restic backup уже финальной БД и
проверить snapshot.

## Rollback

Rollback нужен при 5xx, невозможности входа/refresh, расхождении данных,
ошибках service role, неработающем SMTP или доступном прямом обходе CAPTCHA.

1. Снова включить maintenance mode.
2. Остановить Telegram-бот.
3. Вернуть сохранённый nginx config и `.env.production`.
4. Вернуть `ROLLBACK_COMMIT`.
5. Пересобрать только app, потому что `NEXT_PUBLIC_SUPABASE_URL` встроен в
   клиентский bundle на build-этапе; одного restart недостаточно.
6. Запустить bot со старым managed URL/key.
7. Выполнить health и login smoke-test.

```bash
source /root/.artrest-supabase-cutover.state
cd /root/artrest-shifts
git checkout "$ROLLBACK_COMMIT"
cp -a ".env.production.pre-supabase-$TS" .env.production
cp -a "/etc/nginx/sites-available/podrabotka.art-rest.com.pre-supabase-$TS" \
  /etc/nginx/sites-available/podrabotka.art-rest.com
nginx -t

docker compose --env-file .env.production up -d --no-deps --build app
docker compose --env-file .env.production up -d --no-deps --force-recreate telegram-bot
systemctl reload nginx
```

После открытия self-hosted production нельзя долго ждать с rollback: новые
записи уже будут отсутствовать в managed базе. Если такие записи появились,
перед rollback нужно снова заморозить запись, выгрузить delta и отдельно
согласовать перенос. Слепой rollback в этом случае запрещён.

## После успешного cutover

- наблюдать 7–14 дней;
- ежедневно проверять backup timer и ошибки Auth/PostgREST;
- managed Supabase не удалять и не отключать до отдельного GO;
- временный source connection file не удалять без отдельного cleanup GO;
- удаление Telegram выполнить последним отдельным PR, как согласовано;
- юридические и организационные меры по 152-ФЗ остаются отдельной задачей:
  self-hosting закрывает только часть технического контура.
