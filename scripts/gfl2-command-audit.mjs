import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Offline inventory only. It never executes the game or changes recovered books.
export function auditCommands(bookDirectory) {
  const commands = {};
  let books = 0;
  for (const filename of readdirSync(bookDirectory)
    .filter((name) => /^A330\d\d\.book\.json$/.test(name))
    .sort()) {
    const book = JSON.parse(
      readFileSync(resolve(bookDirectory, filename), 'utf8'),
    );
    books++;
    for (const grid of book.importGridList) {
      const header = grid.rows[0].strings;
      const entities = new Map(
        (grid.entityIndexTbl || []).map((index, i) => [
          index,
          grid.entityDataList[i].originalStrings,
        ]),
      );
      for (const row of grid.rows.slice(1)) {
        if (row.isEmpty || row.isCommentOut) continue;
        // Compiled rows contain numeric zero placeholders for dynamic entities.
        // The corresponding originalStrings retain &needSize / &needX / &needY.
        const strings = entities.get(row.rowIndex) || row.strings;
        const record = Object.fromEntries(
          header.map((name, i) => [name, strings[i] || '']),
        );
        const name = record.Command || '(implicit)';
        const entry = (commands[name] ||= {
          count: 0,
          columns: {},
          variants: new Map(),
        });
        entry.count++;
        for (const column of header.filter((column) => column !== 'Command')) {
          const values = (entry.columns[column] ||= new Map());
          const value = record[column];
          const usage = values.get(value) || {
            count: 0,
            first: `${filename.slice(0, 6)}:${row.rowIndex}`,
          };
          usage.count++;
          values.set(value, usage);
        }
        const args = Object.fromEntries(
          Object.entries(record).filter(
            ([key, value]) =>
              key !== 'Command' && key !== 'Text' && value !== '',
          ),
        );
        const key = JSON.stringify(args);
        const variant = entry.variants.get(key) || {
          args,
          count: 0,
          first: `${filename.slice(0, 6)}:${row.rowIndex}`,
        };
        variant.count++;
        entry.variants.set(key, variant);
      }
    }
  }
  return {
    books,
    total: Object.values(commands).reduce(
      (sum, command) => sum + command.count,
      0,
    ),
    commands: Object.fromEntries(
      Object.entries(commands)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, command]) => [
          name,
          {
            count: command.count,
            columns: Object.fromEntries(
              Object.entries(command.columns).map(([column, values]) => [
                column,
                [...values].map(([value, usage]) => ({ value, ...usage })),
              ]),
            ),
            variants: [...command.variants.values()],
          },
        ]),
    ),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const directory =
    process.argv[2] || resolve(root, '../onlystory-gfl2/event_books');
  const audit = auditCommands(directory);
  if (process.argv[3]) {
    writeFileSync(process.argv[3], `${JSON.stringify(audit, null, 2)}\n`);
    console.log(
      `Wrote ${audit.total} rows from ${audit.books} books to ${process.argv[3]}`,
    );
  } else {
    console.log(
      JSON.stringify(
        {
          books: audit.books,
          total: audit.total,
          commands: Object.fromEntries(
            Object.entries(audit.commands).map(([name, command]) => [
              name,
              {
                count: command.count,
                variants: command.variants.length,
                populatedColumns: Object.fromEntries(
                  Object.entries(command.columns)
                    .filter(([, values]) =>
                      values.some(({ value }) => value !== ''),
                    )
                    .map(([column, values]) => [column, values.length]),
                ),
              },
            ]),
          ),
        },
        null,
        2,
      ),
    );
  }
}
