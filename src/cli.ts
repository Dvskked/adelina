import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { env } from './config/env';
import { AdelinaCore } from './core/AdelinaCore';

/**
 * cli.ts
 * ------
 * Interfaz de prueba por consola: una sesión de chat por texto con Adelina.
 * Útil para probar el motor + memoria sin abrir el navegador.
 *
 * Comandos especiales:
 *   /reset  → borra la memoria de esta sesión.
 *   /facts  → muestra los hechos que Adelina ha memorizado de Andrés.
 *   /salir  → cierra la consola.
 */
export async function runCli(): Promise<void> {
  const core = new AdelinaCore();
  if (!core.ready) {
    console.error(
      `[adelina] No hay clave válida para LLM_PROVIDER=${env.llmProvider}. ` +
        'Configura tu archivo .env y vuelve a intentarlo.\n',
    );
    core.dispose();
    return;
  }

  const sessionId = randomUUID();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let running = true;
  rl.on('close', () => {
    running = false;
  });

  console.log('============================================================');
  console.log(`  ADELINA — modo consola (proveedor: ${core.providerName})`);
  console.log('  Sesión: ' + sessionId.slice(0, 8) + '…');
  console.log('  Escribe /salir para terminar, /reset para olvidar,');
  console.log('  /facts para ver lo que recuerdo de ti.');
  console.log('============================================================\n');

  console.log('Adelina: Hola. Soy Adelina. He venido para quedarme un rato contigo, ¿cómo estás?\n');

  while (running) {
    const line = (await rl.question('Andrés: ').catch(() => '')).trim();
    if (!running) break;
    if (!line) continue;

    if (line === '/salir' || line === '/exit') {
      console.log('\nAdelina: Descansa, que aquí me quedo esperándote. Cuídate mucho.\n');
      break;
    }

    if (line === '/reset') {
      core.forgetSession(sessionId);
      console.log('Adelina: Listo, he olvidado nuestra conversación. Empezamos de cero.\n');
      continue;
    }

    if (line === '/facts') {
      const facts = core.rememberedFacts;
      if (facts.length === 0) {
        console.log('Adelina: Todavía no he memorizado nada de ti. Háblame de tu vida.\n');
      } else {
        console.log('\nLo que recuerdo de ti:');
        for (const f of facts) {
          console.log(`  · ${f.value}  [${f.category} · refuerzo ${f.occurrences}]`);
        }
        console.log('');
      }
      continue;
    }

    try {
      const started = Date.now();
      const { reply } = await core.respond(sessionId, line);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`\nAdelina (${elapsed}s): ${reply}\n`);
    } catch (err) {
      console.error(`\n[adelina] error: ${(err as Error).message}\n`);
    }
  }

  rl.close();
  core.dispose();
}