import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../../config/env';
import { FACT_CATEGORIES, type FactCategory, type MemoryFact, type MemoryMessage } from '../types';

interface MessageRow {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

interface FactRow {
  key: string;
  value: string;
  category: string;
  confidence: number;
  occurrences: number;
  created_at: number;
  updated_at: number;
}

/**
 * SqliteStore
 * -----------
 * Capa de persistencia a largo plazo de Adelina, sobre SQLite.
 *
 * Tablas:
 *  - messages  → historial completo de conversaciones (por sesión).
 *  - facts     → hechos clave sobre el usuario (deduplicados por `key`).
 *  - summaries → resumen episódico por sesión.
 *
 * Usa `node:sqlite` (módulo nativo de Node ≥ 22.5), lo que evita compilar
 * dependencias C++ (better-sqlite3) y mantiene el proyecto totalmente portable.
 */
export class SqliteStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath: string = env.dbPath) {
    // Asegura que el directorio de la base exista.
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  /** Crea el esquema si no existe (idempotente). */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT    NOT NULL,
        role       TEXT    NOT NULL CHECK (role IN ('user','assistant')),
        content    TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, id);

      CREATE TABLE IF NOT EXISTS facts (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'otro',
        confidence  REAL NOT NULL DEFAULT 0.8,
        occurrences INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_facts_category ON facts (category);

      CREATE TABLE IF NOT EXISTS summaries (
        session_id TEXT PRIMARY KEY,
        content    TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  // ------------------------------------------------------------------
  // Mensajes
  // ------------------------------------------------------------------

  /** Guarda un mensaje y devuelve la fila creada. */
  addMessage(sessionId: string, role: MemoryMessage['role'], content: string): void {
    this.db
      .prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, role, content, Date.now());
  }

  /**
   * Últimos `limit` mensajes de una sesión, en orden cronológico ascendente
   * (el más reciente al final, listo para inyectar en el prompt).
   */
  getMessages(sessionId: string, limit = 100): MemoryMessage[] {
    const rows = this.db
      .prepare(
        'SELECT id, session_id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(sessionId, limit) as unknown as MessageRow[];

    return rows.reverse().map(mapMessage);
  }

  /** Todos los mensajes de una sesión (para resúmenes completos). */
  getAllMessages(sessionId: string): MemoryMessage[] {
    const rows = this.db
      .prepare(
        'SELECT id, session_id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id ASC',
      )
      .all(sessionId) as unknown as MessageRow[];

    return rows.map(mapMessage);
  }

  /** Cuenta los mensajes de una sesión. */
  countMessages(sessionId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS total FROM messages WHERE session_id = ?')
      .get(sessionId) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  /** Borra el historial y el resumen de una sesión ("reset de memoria"). */
  forgetSession(sessionId: string): void {
    this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    this.db.prepare('DELETE FROM summaries WHERE session_id = ?').run(sessionId);
  }

  // ------------------------------------------------------------------
  // Hechos (memoria semántica)
  // ------------------------------------------------------------------

  /**
   * Inserta o refuerza un hecho. Si la clave ya existe:
   *  - actualiza el valor (en caso de cambio) y la categoría,
   *  - incrementa `occurrences` (refuerzo).
   */
  upsertFact(fact: Omit<MemoryFact, 'createdAt' | 'updatedAt' | 'occurrences'>): MemoryFact {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO facts (key, value, category, confidence, occurrences, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value       = excluded.value,
          category    = excluded.category,
          confidence  = MAX(facts.confidence, excluded.confidence),
          occurrences = facts.occurrences + 1,
          updated_at  = excluded.updated_at
        `,
      )
      .run(fact.key, fact.value, fact.category, fact.confidence, now, now);

    return this.getFact(fact.key)!;
  }

  getFact(key: string): MemoryFact | null {
    const row = this.db
      .prepare('SELECT * FROM facts WHERE key = ?')
      .get(key) as FactRow | undefined;
    return row ? mapFact(row) : null;
  }

  /** Devuelve los hechos más relevantes (más reforzados y actualizados). */
  getFacts(limit = 100): MemoryFact[] {
    const rows = this.db
      .prepare('SELECT * FROM facts ORDER BY occurrences DESC, updated_at DESC LIMIT ?')
      .all(limit) as unknown as FactRow[];
    return rows.map(mapFact);
  }

  /** Borra todos los hechos (útil en pruebas o reset total). */
  clearFacts(): void {
    this.db.prepare('DELETE FROM facts').run();
  }

  // ------------------------------------------------------------------
  // Resúmenes (memoria episódica)
  // ------------------------------------------------------------------

  getSummary(sessionId: string): string | null {
    const row = this.db
      .prepare('SELECT content FROM summaries WHERE session_id = ?')
      .get(sessionId) as { content: string } | undefined;
    return row?.content ?? null;
  }

  upsertSummary(sessionId: string, content: string): void {
    this.db
      .prepare(
        `
        INSERT INTO summaries (session_id, content, created_at) VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          content    = excluded.content,
          created_at = excluded.created_at
        `,
      )
      .run(sessionId, content, Date.now());
  }

  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}

// ----------------------------------------------------------------------
// Mapeadores fila → dominio
// ----------------------------------------------------------------------

function mapMessage(row: MessageRow): MemoryMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function mapFact(row: FactRow): MemoryFact {
  return {
    key: row.key,
    value: row.value,
    category: FACT_CATEGORIES.includes(row.category as FactCategory) ? (row.category as FactCategory) : 'otro',
    confidence: row.confidence,
    occurrences: row.occurrences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}