// Drizzle delimits multi-statement migrations explicitly. Keep trigger bodies
// intact; their internal semicolons do not end the CREATE TRIGGER statement.
export function migrationStatements(source) {
  return source.split('--> statement-breakpoint').flatMap(chunk => {
    const sql = chunk.replace(/--[^\n]*/g, '').trim();
    return /^CREATE TRIGGER\b/i.test(sql) ? [sql] : sql.split(';').map(s => s.trim()).filter(Boolean);
  });
}
