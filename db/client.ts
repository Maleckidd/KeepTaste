import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { MIGRATION_DDL } from './ddl';

// Open the database
const sqlite = SQLite.openDatabaseSync('recipes.db');

// Initialize Drizzle with the database and schema
export const db = drizzle(sqlite, { schema });

// Migration — create tables if they don't exist
export function runMigrations() {
  sqlite.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    ${MIGRATION_DDL}
  `);
}
