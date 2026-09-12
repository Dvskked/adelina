import { env } from './config/env';
import { AdelinaCore } from './core/AdelinaCore';
import { VoiceService } from './voice/VoiceService';

/**
 * smoke.ts — test rápido de arranque.
 * Verifica configuración (claves) y conectividad con el proveedor LLM.
 * Uso: npm run smoke
 */
export async function smokeTest(): Promise<void> {
  console.log('──── ADELINA · smoke test ────\n');

  console.log(`Modo:            ${env.mode}`);
  console.log(`Proveedor LLM:   ${env.llmProvider} (modelo por defecto disponible)`);
  console.log(`STT (escucha):   ${env.sttEngine === 'openai' ? 'Whisper ' + env.openai.whisperModel : 'navegador'}`);
  console.log(`TTS (habla):     ${env.elevenLabs.apiKey ? 'ElevenLabs' : 'navegador (sin clave)'}`);
  console.log(`Memoria DB:      ${env.dbPath}`);
  console.log('');

  const core = new AdelinaCore();
  console.log(`Clave LLM:       ${core.ready ? 'configurada' : 'FALTA (revisa .env)'}`);

  if (!core.ready) {
    console.error('\n[adelina] No se puede continuar sin una clave de LLM.\n');
    core.dispose();
    process.exit(1);
  }

  try {
    console.log('Comprobando conectividad con el proveedor…');
    const ok = await core.llm.provider.ping();
    console.log(`  → ${ok ? 'conexión OK' : 'respuesta inesperada'} (proveedor: ${core.providerName})`);
  } catch (err) {
    console.log(`  → sin conexión / error: ${(err as Error).message}`);
  }

  const voice = new VoiceService();
  console.log(`STT Whisper:     ${env.openai.apiKey ? 'credencial presente' : 'sin clave (usar navegador)'}`);
  console.log(`TTS ElevenLabs:  ${voice.ttsAvailable ? 'credencial presente' : 'sin clave (usar navegador)'}`);

  console.log('\n──── smoke test finalizado ────');
  core.dispose();
  process.exit(0);
}