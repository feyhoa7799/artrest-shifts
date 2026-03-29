import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

await import('./geocode-restaurants.mjs');