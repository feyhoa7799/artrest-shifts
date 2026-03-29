import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

await import('./update-metro.mjs');