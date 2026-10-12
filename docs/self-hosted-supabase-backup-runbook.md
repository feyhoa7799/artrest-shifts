# Внешний backup self-hosted Supabase

Статус: runbook. Никакие команды из этого документа не выполняются без
отдельного GO.

## Назначение

До переключения production-приложения на self-hosted Supabase нужна независимая
зашифрованная копия вне текущего сервера. Копия на том же диске не защищает от
поломки диска, удаления сервера или компрометации Docker host.

Выбранный вариант:

- Timeweb Cloud S3;
- приватный bucket;
- холодный класс, 100 ГБ;
- размещение S3: Санкт-Петербург, Россия;
- ориентировочная стоимость: 349 ₽/месяц;
- endpoint: `https://s3.twcstorage.ru`;
- region: `ru-1`.

Цены и размещение проверяются в панели непосредственно перед заказом.

## Ручное действие владельца

1. Открыть Timeweb Cloud -> «Хранилище S3».
2. Создать приватный bucket холодного класса на 100 ГБ.
3. Не включать публичный доступ.
4. Не включать Object Lock на первом запуске: он может блокировать очистку
   устаревших Restic-объектов.
5. Создать отдельную пару Access Key / Secret Key только для backup.
6. Не отправлять Secret Key и пароль Restic в чат.

После этого в защищённой сессии на сервере потребуется ввести:

- имя bucket;
- Access Key;
- Secret Key.

## Подготовка сервера

Команды выполняются только после отдельного GO:

```bash
sudo apt-get update
sudo apt-get install --yes restic

sudo install -d -m 0700 /var/backups/artrest-supabase
sudo install -m 0750 infra/supabase/backup-postgres.sh \
  /usr/local/sbin/artrest-supabase-backup
sudo install -m 0600 infra/supabase/backup.env.example \
  /etc/artrest-supabase-backup.env
sudo install -m 0644 infra/supabase/artrest-supabase-backup.service \
  /etc/systemd/system/artrest-supabase-backup.service
sudo install -m 0644 infra/supabase/artrest-supabase-backup.timer \
  /etc/systemd/system/artrest-supabase-backup.timer
```

Файл `/etc/artrest-supabase-backup.env` редактируется вручную без вывода
значений в терминал. В нём заменяются только `CHANGE_ME_BUCKET`, Access Key и
Secret Key.

Пароль шифрования Restic создаётся отдельно:

```bash
sudo sh -c 'umask 077; openssl rand -base64 48 > /etc/artrest-supabase-backup.password'
```

Пароль нельзя хранить только на этом же сервере. Его копия передаётся в
корпоративное защищённое хранилище секретов. Без этого файла backup невозможно
расшифровать.

## Инициализация repository

После заполнения root-only файлов:

```bash
sudo bash -lc '
  set -a
  source /etc/artrest-supabase-backup.env
  set +a
  restic init
'
```

Повторный `restic init` выполнять нельзя. Если repository уже существует,
сначала выясняется причина и проверяются bucket и credentials.

## Первый backup

Timer пока не включается:

```bash
sudo systemctl daemon-reload
sudo systemctl start artrest-supabase-backup.service
sudo systemctl status artrest-supabase-backup.service --no-pager
sudo journalctl -u artrest-supabase-backup.service -n 100 --no-pager
```

Успешный status недостаточен. Нужно проверить snapshot:

```bash
sudo bash -lc '
  set -a
  source /etc/artrest-supabase-backup.env
  set +a
  restic snapshots --latest 1 --tag artrest-supabase
  restic check
'
```

Логи не должны содержать credentials, password или содержимое `.env`.

## Тест восстановления

До cutover последний snapshot восстанавливается в отдельный root-only каталог.
Затем custom dump загружается в отдельный временный PostgreSQL-контейнер той же
мажорной версии. Проверяются:

- `pg_restore --list`;
- количество `auth.users` и `auth.identities`;
- counts всех ключевых `public` таблиц;
- наличие RLS policies, функций и triggers;
- вход существующего тестового пользователя в тестовом приложении.

Тест не должен использовать рабочий контейнер `supabase-db` как цель restore.

## Включение расписания

Только после успешного тестового восстановления:

```bash
sudo systemctl enable --now artrest-supabase-backup.timer
sudo systemctl list-timers artrest-supabase-backup.timer --no-pager
```

Расписание: ежедневно около 03:30 по Москве с случайной задержкой до 15 минут.

Retention:

- 14 ежедневных копий;
- 8 недельных копий;
- 12 месячных копий.

## Остановка и rollback

Остановка расписания не удаляет backup:

```bash
sudo systemctl disable --now artrest-supabase-backup.timer
```

Не удалять repository, bucket, password file или snapshots до отдельного
подтверждения. При ошибке backup production-приложение продолжает работать, но
production cutover self-hosted Supabase запрещён до восстановления резервирования.
