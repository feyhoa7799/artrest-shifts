import { createBot } from './bot.js';
import { startWorker } from './worker.js';

async function main() {
  const bot = createBot();
  const stopWorker = startWorker(bot);

  await bot.launch();

  console.log('[telegram-bot] started');

  const shutdown = (signal: string) => {
    console.log(`[telegram-bot] stopping on ${signal}`);
    stopWorker();
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[telegram-bot] fatal error', error);
  process.exit(1);
});