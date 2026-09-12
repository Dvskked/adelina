import { env } from './config/env';

/**
 * index.ts — punto de entrada.
 *
 * Selecciona el modo de ejecución:
 *   ADELINA_MODE=web   → servidor local con interfaz y voz (por defecto).
 *   ADELINA_MODE=cli   → conversación por texto en la consola.
 *   ADELINA_MODE=smoke → verifica configuración y conectividad, y sale.
 */
async function main(): Promise<void> {
  switch (env.mode) {
    case 'cli': {
      const { runCli } = await import('./cli');
      await runCli();
      break;
    }
    case 'smoke': {
      const { smokeTest } = await import('./smoke');
      await smokeTest();
      break;
    }
    default: {
      const { startServer } = await import('./server');
      await startServer();
      break;
    }
  }
}

main().catch((err) => {
  console.error('[adelina] error fatal:', err);
  process.exit(1);
});