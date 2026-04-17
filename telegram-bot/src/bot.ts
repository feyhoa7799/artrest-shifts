import { Context, Telegraf } from 'telegraf';

import { supabase } from './db.js';
import {
  buildLinkErrorMessage,
  buildLinkSuccessMessage,
  buildNotificationKeyboard,
  buildStartKeyboard,
  buildStartMessage,
} from './templates.js';
import { config } from './config.js';

type TelegramLinkTokenRow = {
  token: string;
  user_id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
};

function parseStartPayload(text?: string) {
  if (!text) return '';
  const parts = text.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
}

function isExpired(value: string) {
  return new Date(value).getTime() < Date.now();
}

export function createBot() {
  const bot = new Telegraf(config.telegramBotToken);

  bot.start(async (ctx: Context) => {
    const message =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const payload = parseStartPayload(message);

    if (!payload) {
      await ctx.reply(buildStartMessage(), {
        reply_markup: buildStartKeyboard(),
      });
      return;
    }

    const { data: tokenRow } = await supabase
      .from('telegram_link_tokens')
      .select('token, user_id, email, expires_at, used_at')
      .eq('token', payload)
      .maybeSingle();

    const tokenData = (tokenRow || null) as TelegramLinkTokenRow | null;

    if (!tokenData || tokenData.used_at || isExpired(tokenData.expires_at)) {
      await ctx.reply(buildLinkErrorMessage(), {
        reply_markup: buildStartKeyboard(),
      });
      return;
    }

    if (!ctx.from || !ctx.chat) {
      await ctx.reply('Не удалось получить данные Telegram. Попробуй ещё раз.');
      return;
    }

    await supabase.from('telegram_links').delete().eq('user_id', tokenData.user_id);
    await supabase.from('telegram_links').delete().eq('telegram_user_id', ctx.from.id);

    const now = new Date().toISOString();

    const { error: insertError } = await supabase.from('telegram_links').insert({
      user_id: tokenData.user_id,
      email: tokenData.email,
      telegram_user_id: ctx.from.id,
      chat_id: ctx.chat.id,
      telegram_username: ctx.from.username || null,
      telegram_first_name: ctx.from.first_name || null,
      telegram_last_name: ctx.from.last_name || null,
      is_active: true,
      linked_at: now,
      updated_at: now,
    });

    if (insertError) {
      await ctx.reply('Не удалось завершить привязку Telegram. Попробуй ещё раз позже.');
      return;
    }

    await supabase.from('telegram_notification_settings').upsert(
      {
        user_id: tokenData.user_id,
        is_enabled: true,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    );

    await supabase
      .from('telegram_link_tokens')
      .update({ used_at: now })
      .eq('token', tokenData.token);

    await ctx.reply(buildLinkSuccessMessage(), {
      reply_markup: buildNotificationKeyboard(),
    });
  });

  bot.action('disable_notifications', async (ctx: Context) => {
    try {
      if (!ctx.from) {
        await ctx.answerCbQuery('Не удалось определить пользователя');
        return;
      }

      const { data: link } = await supabase
        .from('telegram_links')
        .select('user_id')
        .eq('telegram_user_id', ctx.from.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!link) {
        await ctx.answerCbQuery('Привязка Telegram не найдена');
        return;
      }

      await supabase.from('telegram_notification_settings').upsert(
        {
          user_id: link.user_id,
          is_enabled: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      await ctx.answerCbQuery('Уведомления отключены');
      await ctx.reply('Готово. Уведомления Telegram выключены.');
    } catch {
      await ctx.answerCbQuery('Не удалось отключить уведомления');
    }
  });

  bot.on('text', async (ctx: Context) => {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';

    if (text.startsWith('/start')) {
      return;
    }

    await ctx.reply(buildStartMessage(), {
      reply_markup: buildStartKeyboard(),
    });
  });

  return bot;
}