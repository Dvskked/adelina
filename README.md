# Adelina

Asistente / compañera virtual con **memoria profunda**, **voz natural** e
**inteligencia emocional**, construida en TypeScript para Node.js.

No es un bot corporativo: su system prompt la define como una compañera
cercana con empatía real, que recuerda detalles de tu vida y adapta su tono
a cómo llegas a la conversación.

---

## Arquitectura

```
F:\Adelina
├── src
│   ├── index.ts                 → punto de entrada (modo web | cli | smoke)
│   ├── server.ts                → servidor web local (Express) + API de voz
│   ├── cli.ts                   → conversación por texto en consola
│   ├── smoke.ts                 → test rápido de configuración
│   ├── config/env.ts            → lectura y validación de variables de entorno
│   ├── core/AdelinaCore.ts      → ORQUESTADOR: unifica memoria + LLM por interacción
│   ├── memory/
│   │   ├── MemoryManager.ts     → corto plazo (historial) + largo plazo (SQLite)
│   │   ├── storage/SqliteStore.ts → persistencia real (Schema + CRUD)
│   │   ├── prompts.ts           → extracción de hechos y resúmenes (LLM)
│   │   └── types.ts             → modelos de memoria
│   ├── services/llm/
│   │   ├── LlmService.ts        → fachada sobre el proveedor activo
│   │   ├── systemPrompt.ts      → personalidad y reglas de Adelina
│   │   ├── OpenAIProvider.ts / AnthropicProvider.ts / GeminiProvider.ts
│   │   └── types.ts             → contrato LlmProvider
│   ├── voice/VoiceService.ts    → STT (Whisper) + TTS (ElevenLabs)
│   └── ui/public/               → interfaz web (chat + voz, sin frameworks)
├── data/                        → SQLite generado en runtime (adelina.db)
├── .env.example
└── package.json
```

### Cómo fluye una conversación

```
a) Por voz:  micrófono → MediaRecorder (WebM) → POST /api/voice
             → Whisper (STT) → AdelinaCore.respond() → JSON (texto)
             → voz por ElevenLabs (GET /api/tts) o speechSynthesis del navegador

b) Por texto: POST /api/chat → AdelinaCore.respond() → JSON (texto) → voz

AdelinaCore.respond():
   1. guarda el mensaje en la memoria a largo plazo (SQLite)
   2. recupera hechos memorizados + resumen episódico + historial reciente
   3. arma el system prompt (personalidad + memoria) y llama al LLM
   4. guarda la respuesta, extrae hechos nuevos y resume si toca
```

---

## Requisitos

- **Node.js ≥ 18.17** (necesario para `fetch`, `FormData` y `Blob` nativos).
  Verifica con `node -v`.

## Instalación

```bash
# 1) Clona/entra en la carpeta del proyecto
cd F:\Adelina

# 2) Instala dependencias
npm install

# 3) Configura las claves de API
copy .env.example .env        # Windows PowerShell:  Copy-Item .env.example .env
# y edita .env con tus claves:
#   - mínimas:   LLM_PROVIDER + OPENAI_API_KEY (u otra)
#   - voz:       OPENAI_API_KEY → Whisper STT
#   - voz natural: ELEVENLABS_API_KEY (opcional; si no, usa la voz del navegador)
```

## Ejecutar

```bash
# Interfaz web (recomendada: chat + voz) → http://localhost:3000
npm run start:web

# Modo consola (solo texto, sin navegador)
npm run start:cli

# Smoke test: verifica claves y conectividad sin abrir nada
npm run smoke
```

Argumentos útiles:
`ADELINA_MODE=web npm run start` · `PORT=4000 npm run start:web` · etc.
(si usas PowerShell: `$env:PORT="4000"; npm run start:web`)

## Probar la voz en el navegador

1. Abre `http://localhost:3000`.
2. Pulsa el **micrófono** y habla en español; suéltalo para terminar.
3. Adelina transcribe (Whisper), responde y te contesta **por voz**.
4. El selector de "Voz" permite elegir **ElevenLabs** (voz natural) o la voz
   del **navegador** (sin consumo ni claves).
5. Escribe también con el teclado; pulsa **Olvidar** para borrar la memoria
   de esa conversación.

## Memoria

Todo lo que se comparte se persiste en `data/adelina.db` (SQLite):

- `messages`  → historial completo por sesión.
- `facts`     → hechos clave sobre Andrés (deduplicados, con refuerzo por
  repetición). Adelina los inyecta en su prompt y los menciona con
  naturalidad en conversaciones futuras.
- `summaries` → resumen episódico por conversación (se regenera cada
  `SUMMARIZE_EVERY` mensajes) para mantener el hilo en sesiones largas.

Configurable en `.env`: `MAX_HISTORY`, `SUMMARIZE_EVERY`, `MAX_FACTS_IN_PROMPT`.

## Dependencias

- **Runtime:** `express` (web local) · `better-sqlite3` (memoria) · `dotenv` (config).
  Los LLM (OpenAI/Anthropic/Gemini), Whisper y ElevenLabs usan `fetch` nativo,
  sin SDKs de terceros.
- **Dev:** `typescript` · `tsx` (ejecutar TS en caliente) · `cross-env` · tipos.

## Comandos de desarrollo

```bash
npm run dev          # tsx watch → reinicio automático al guardar
npm run build        # compila a dist/
npm run typecheck    # verificación estática de tipos
npm run preview      # ejecuta el build (node dist/index.js)
```

## Personalizar a Adelina

- **Personalidad:** edita `src/services/llm/systemPrompt.ts` (su identidad, tono
  y reglas). Todo está escrito en lenguaje natural y en español.
- **Nombre del usuario:** `ADELINA_USER_NAME` en `.env`.
- **Voz:** cambia `ELEVENLABS_VOICE_ID` en `.env` (cualquier voz del catálogo de
  ElevenLabs).
- **Modelo:** cambia `LLM_PROVIDER` y el modelo correspondiente. Los tres
  proveedores (OpenAI, Anthropic, Gemini) son intercambiables sin tocar el código.