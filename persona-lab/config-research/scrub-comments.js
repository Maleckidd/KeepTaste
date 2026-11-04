// Rewrites every .ts/.tsx file under a directory without its comments. They carry
// the product's reasoning and references to its spec, which this study's lead
// researcher must not see. Run by scope_scrub in config.sh on a throwaway copy.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const printer = ts.createPrinter({ removeComments: true });

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
    } else if (/\.tsx?$/.test(entry.name)) {
      const kind = entry.name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, kind);
      fs.writeFileSync(file, printer.printFile(source));
    }
  }
}

walk(process.argv[2]);
