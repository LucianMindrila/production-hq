import { readFile,mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
export async function loadAuth() {
  const dir=await mkdtemp(join(tmpdir(),'phq-auth-'));
  for(const name of ['config','mcp-auth']) {
    const source=await readFile(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./config'", "'./config.mjs'");
    // Resolve jose from the project rather than the temporary directory.
    await writeFile(join(dir,name+'.mjs'),output.replace("from 'jose'",`from '${import.meta.resolve('jose')}'`));
  }
  return {auth:await import(pathToFileURL(join(dir,'mcp-auth.mjs'))),config:await import(pathToFileURL(join(dir,'config.mjs')))};
}
