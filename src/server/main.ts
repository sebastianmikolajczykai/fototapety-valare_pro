// Start serwera: npm start (po npm run build). Konfiguracja tylko ze zmiennych środowiskowych:
// PORT (w internecie) albo LOCAL_PORT (lokalnie, domyślnie 3100), APP_PASSWORD, SESSION_SECRET, OSADZENIE_NA,
// OPENAI_API_KEY, REPLICATE_API_TOKEN, TOPAZ_API_KEY, UPSCALER, AI_LIMIT_DZIENNY, PUBLIC_DIR (folder strony,
// domyślnie dist/public z npm run build).
import { fileURLToPath } from 'node:url';
import { FototapetyServer } from './app';

const root = process.env.PUBLIC_DIR || fileURLToPath(new URL('../public', import.meta.url));
FototapetyServer.fromEnv(process.env, root).listen();

// Ostatnia siatka bezpieczeństwa: zgubiony błąd w tle zapisujemy w logu zamiast wyłączać serwer.
process.on('unhandledRejection', e => console.log('Nieobsłużony błąd w tle:', (e instanceof Error && e.stack) || e));
