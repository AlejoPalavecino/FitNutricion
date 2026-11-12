const ts = require('typescript'),
  fs = require('fs');
const config = ts.readConfigFile('tsconfig.app.json', ts.sys.readFile),
  parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const files = parsed.fileNames,
  host = {
    getScriptFileNames: () => files,
    getScriptVersion: () => '0',
    getScriptSnapshot: (f) =>
      fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined,
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };
const service = ts.createLanguageService(host);
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const changes = service.organizeImports({ type: 'file', fileName: file }, {}, {});
  for (const change of changes)
    for (const edit of [...change.textChanges].sort((a, b) => b.span.start - a.span.start))
      text =
        text.slice(0, edit.span.start) +
        edit.newText +
        text.slice(edit.span.start + edit.span.length);
  fs.writeFileSync(file, text);
}
