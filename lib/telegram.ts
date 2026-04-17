import { randomBytes } from 'crypto';

export const TELEGRAM_LINK_TOKEN_TTL_MINUTES = 60;

export function getTelegramBotUsername() {
  return (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
}

export function getTelegramBotUrl() {
  const username = getTelegramBotUsername();

  if (!username) return null;

  return `https://t.me/${username}`;
}

export function buildTelegramDeepLink(token: string) {
  const username = getTelegramBotUsername();

  if (!username) {
    throw new Error('TELEGRAM_BOT_USERNAME is not configured');
  }

  return `https://t.me/${username}?start=${token}`;
}

export function createTelegramLinkToken() {
  return randomBytes(24).toString('base64url');
}

export function formatTelegramUsername(username?: string | null) {
  if (!username) return null;
  return `@${username.replace(/^@/, '')}`;
}