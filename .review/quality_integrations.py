from pathlib import Path

def write(name,text):
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
write('src/services/openFoodFacts.ts',r'''import type { FoodItem } from '../types/nutrition';
export interface FoodSearchResult { foods:FoodItem[]; incompleteCount:number }
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function nutrient(value:unknown):number|null{
 if(value===null||value===undefined||value==='')return null;
 const n=typeof value==='number'?value:typeof value==='string'?Number(value):NaN;
 return Number.isFinite(n)&&n>=0?n:null;
}
/** Unknown nutrient values are not silently converted to zero. */
export function parseProduct(raw:unknown):FoodItem|null{
 const p=record(raw),n=record(p.nutriments),code=String(p.code??'');
 if(!/^\d{8,14}$/.test(code))return null;
 const kcal=nutrient(n['energy-kcal_100g']),protein=nutrient(n.proteins_100g),carbs=nutrient(n.carbohydrates_100g),fat=nutrient(n.fat_100g),fiber=nutrient(n.fiber_100g);
 if([kcal,protein,carbs,fat,fiber].some(v=>v===null))return null;
 const name=p.product_name_es||p.product_name;
 if(typeof name!=='string'||!name.trim())return null;
 return {id:`off-${code}`,barcode:code,name:name.slice(0,200),brand:typeof p.brands==='string'?p.brands.slice(0,120):'Open Food Facts',kcalPer100g:kcal!,proteinPer100g:protein!,carbsPer100g:carbs!,fatPer100g:fat!,fiberPer100g:fiber!,defaultServingName:'100 g',defaultServingGrams:100,isCustom:true,isFavorite:false};
}
export async function searchOpenFoodFacts(query:string,signal?:AbortSignal,request:typeof fetch=fetch):Promise<FoodSearchResult>{
 const q=query.trim().slice(0,120);if(!q)return {foods:[],incompleteCount:0};
 const barcode=/^\d{8,14}$/.test(q);
 const url=barcode?`https://world.openfoodfacts.org/api/v2/product/${q}.json`:`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10`;
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(abort,10000);
 try{
  const response=await request(url,{signal:controller.signal});
  if(!response.ok)throw new Error(response.status===429?'Open Food Facts limita las consultas. Reintenta más tarde.':'No se pudo consultar Open Food Facts.');
  const body=record(await response.json());
  const rows:unknown[]=barcode?(body.product?[{...record(body.product),code:q}]:[]):Array.isArray(body.products)?body.products:[];
  const foods=rows.map(parseProduct).filter((p):p is FoodItem=>p!==null);
  return {foods,incompleteCount:rows.length-foods.length};
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
''')
p=Path('src/components/dashboard/NutritionDashboard.tsx');s=p.read_text().replace("useMemo, useState","useEffect, useMemo, useRef, useState");s="import { searchOpenFoodFacts } from '../../services/openFoodFacts';\n"+s
a=s.index('  const handleSearchOpenFoodFacts =');b=s.index('\n  const handleMultiPaste',a)
s=s[:a]+'''  const foodRequest = useRef<AbortController | null>(null);
  const [foodSearchMessage, setFoodSearchMessage] = useState('');
  useEffect(()=>()=>foodRequest.current?.abort(),[]);
  const handleSearchOpenFoodFacts = async () => {
    foodRequest.current?.abort();
    const request = new AbortController(); foodRequest.current=request;
    setOffLoading(true);setOffResults([]);setFoodSearchMessage('');
    try {
      const result=await searchOpenFoodFacts(foodQuery,request.signal);
      if(request.signal.aborted)return;
      setOffResults(result.foods);
      setFoodSearchMessage(result.incompleteCount ? `${result.incompleteCount} productos omitidos por datos incompletos. Puedes crear un alimento verificando su etiqueta.` : result.foods.length ? 'Fuente: Open Food Facts. Verifica los datos con la etiqueta del producto.' : 'No se encontraron productos con datos completos.');
    } catch (error) {
      if(!request.signal.aborted)setFoodSearchMessage(error instanceof Error ? error.message : 'No se pudo completar la búsqueda.');
    } finally {if(foodRequest.current===request)setOffLoading(false);}
  };
'''+s[b:]
s=s.replace('      {/* ====================================================================\n          RESUMEN SIMPLE DEL DÍA','      {foodSearchMessage && <p role="status" className="rounded-xl border p-3 text-sm">{foodSearchMessage}</p>}\n      {/* ====================================================================\n          RESUMEN SIMPLE DEL DÍA')
p.write_text(s)
write('scripts/literal-data.ts',r'''import { parse } from 'acorn';
/** Reads a JS data declaration without running downloaded JavaScript. */
export function readLiteralData(source:string):unknown{
 const program=parse(source,{ecmaVersion:'latest',sourceType:'module'}) as unknown as Node;
 const declarations=new Map<string,Node>();let selected:Node|undefined;
 for(const statement of program.body??[]){
  const declaration=statement.type==='ExportDefaultDeclaration'?undefined:statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
  if(declaration?.type==='VariableDeclaration')for(const item of declaration.declarations??[]){if(item.id?.type==='Identifier'&&item.init){declarations.set(item.id.name!,item.init);selected??=item.init;}}
  if(statement.type==='ExportDefaultDeclaration')selected=statement.declaration;
 }
 if(selected?.type==='Identifier')selected=declarations.get(selected.name!);
 if(!selected)throw new Error('No data declaration found.');
 function literal(node:Node,depth=0):unknown{
  if(depth>50)throw new Error('Data nesting limit exceeded.');
  switch(node.type){
   case 'Literal': if(node.value===null||['string','number','boolean'].includes(typeof node.value))return node.value;break;
   case 'UnaryExpression':if(node.operator==='-'&&node.argument?.type==='Literal'&&typeof node.argument.value==='number')return -node.argument.value;break;
   case 'ArrayExpression':return (node.elements??[]).map(item=>{if(!item)throw new Error('Array holes rejected.');return literal(item,depth+1);});
   case 'ObjectExpression':{
    const result:Record<string,unknown>=Object.create(null);
    for(const property of node.properties??[]){
     if(property.type!=='Property'||property.kind!=='init'||property.method||property.computed||property.shorthand)throw new Error('Only literal properties are allowed.');
     const key=property.key?.type==='Identifier'?property.key.name:property.key?.value;
     if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)||!property.valueNode)throw new Error('Unsafe object key.');
     result[key]=literal(property.valueNode,depth+1);
    }return result;
   }
  }
  throw new Error(`Executable or unsupported syntax rejected: ${node.type}`);
 }
 // Acorn calls the property's expression "value"; normalize only AST structure.
 function normalize(node:Node){if(node.type==='Property')node.valueNode=node.value as unknown as Node;for(const [key,value]of Object.entries(node)){if(key==='valueNode')continue;if(Array.isArray(value))value.forEach(v=>{if(v&&typeof v==='object'&&'type'in v)normalize(v);});else if(value&&typeof value==='object'&&'type'in value)normalize(value as Node);}}
 normalize(selected);return literal(selected);
}
interface Node{type:string;body?:Node[];declaration?:Node;declarations?:Node[];id?:Node;init?:Node;name?:string;value?:unknown;valueNode?:Node;elements?:(Node|null)[];properties?:Node[];key?:Node;kind?:string;method?:boolean;computed?:boolean;shorthand?:boolean;operator?:string;argument?:Node}
''')
p=Path('scripts/ingest-opengym.ts');s=p.read_text();s="import { readLiteralData } from './literal-data.ts';\nimport { createHash } from 'node:crypto';\n"+s
s=s.replace('trees/main?recursive=1','trees/678bf5bf10446e8997a77d43e89c9b2721d8d0fc?recursive=1').replace('emilfunk/opengym/main','emilfunk/opengym/678bf5bf10446e8997a77d43e89c9b2721d8d0fc').replace('hasaneyldrm/exercises-dataset/main','hasaneyldrm/exercises-dataset/7455efae41b330c265e7cd4b78dfa848e7ce5ebd')
a=s.index('function parseJsDefaultExportObject(');b=s.index('function translateGenericEnglishExerciseName',a)
s=s[:a]+'''function parseJsDefaultExportObject(source:string):Record<string, any>{
 const value=readLiteralData(source);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid dictionary.');return value as Record<string,any>;
}
function parseExdbArray(source:string):RawOpenGymExercise[]{
 const value=readLiteralData(source);
 if(!Array.isArray(value)||!value.length||value.some(row=>!row||typeof row.id!=='string'||typeof row.n!=='string'||typeof row.eq!=='string'||typeof row.bp!=='string'||typeof row.tg!=='string'))throw new Error('Invalid exercise dataset.');
 if(new Set(value.map(row=>row.id)).size!==value.length)throw new Error('Duplicate source IDs.');return value;
}
async function fetchText(url:string):Promise<string>{
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Source request failed: ${response.status}`);return response.text();
}

'''+s[b:]
s=s.replace("  const shouldDownloadMedia = args.includes('--download-media');","  const shouldDownloadMedia = args.includes('--download-media');\n  const limit = Number(args.find(arg=>arg.startsWith('--limit='))?.split('=')[1] ?? 50);\n  if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('--limit must be 1..500');")
s=s.replace("fetch(`${OPENGYM_RAW_BASE}/frontend/src/lib/exercises-data.js`).then((r) => r.text())","fetchText(`${OPENGYM_RAW_BASE}/frontend/src/lib/exercises-data.js`)").replace("fetch(`${OPENGYM_RAW_BASE}/frontend/src/locales/es.js`).then((r) => r.text())","fetchText(`${OPENGYM_RAW_BASE}/frontend/src/locales/es.js`)").replace("fetch(`${OPENGYM_RAW_BASE}/frontend/src/instr/es.js`).then((r) => r.text())","fetchText(`${OPENGYM_RAW_BASE}/frontend/src/instr/es.js`)")
s=s.replace('selectedRaw.length >= 50','selectedRaw.length >= limit').replace('for (const raw of selectedRaw)','for (const raw of selectedRaw.slice(0,limit))')
a=s.index('    for (const item of catalog.slice(0, 12))');b=s.index('\n  const outPath =',a)
s=s[:a]+'''    for (const item of catalog) {
      for(let i=0;i<item.images.length;i++){
        const url=item.images[i];
        const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error(`Media request failed: ${response.status}`);
        const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20_000_000)throw new Error('Media too large.');
        const extension=path.extname(new URL(url).pathname).toLowerCase();
        if(!['.png','.jpg','.jpeg','.gif','.webp'].includes(extension))throw new Error('Unsupported media type.');
        const name=createHash('sha256').update(url).digest('hex').slice(0,24)+extension;
        await fs.writeFile(path.join(publicDir,name),bytes);item.images[i]=`/exercises/${name}`;
      }
    }
  }
'''+s[b:]
s=s.replace("  await fs.writeFile(outPath, fileContent, 'utf8');","  if(!catalog.length)throw new Error('Refusing to overwrite an empty catalog.');\n  await fs.writeFile(outPath+'.tmp', fileContent, 'utf8');\n  await fs.rename(outPath+'.tmp',outPath);")
p.write_text(s)
write('src/services/integrations.test.ts',r'''import {describe,it,expect,vi} from 'vitest';
import {parseProduct,searchOpenFoodFacts} from './openFoodFacts';
import {readLiteralData} from '../../scripts/literal-data';
const product={code:'12345678',product_name:'Producto',nutriments:{'energy-kcal_100g':100,proteins_100g:0,carbohydrates_100g:25,fat_100g:0,fiber_100g:0}};
describe('external data contracts',()=>{
 it('distinguishes unknown from measured zero',()=>{expect(parseProduct(product)?.fatPer100g).toBe(0);expect(parseProduct({...product,nutriments:{...product.nutriments,proteins_100g:undefined}})).toBeNull();expect(parseProduct({...product,nutriments:{...product.nutriments,fiber_100g:''}})).toBeNull();});
 it('reports HTTP rate limits',async()=>{const request=vi.fn().mockResolvedValue(new Response('{}',{status:429}));await expect(searchOpenFoodFacts('test',undefined,request)).rejects.toThrow('limita');});
 it('propagates cancellation and encodes search input',async()=>{const c=new AbortController();c.abort();const request=vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>{expect(options?.signal?.aborted).toBe(true);throw new DOMException('Aborted','AbortError');});await expect(searchOpenFoodFacts('pan & leche',c.signal,request)).rejects.toThrow();expect(String(request.mock.calls[0][0])).toContain('pan%20%26%20leche');});
 it('parses literal arrays and default-export dictionaries without execution',()=>{expect(readLiteralData("const EXDB=[{id:'1',n:'press'}];")).toEqual([{id:'1',n:'press'}]);expect(readLiteralData("export default {'A':['B',-1]};")).toEqual({A:['B',-1]});});
 it('rejects calls, getters, prototype keys and executable expressions',()=>{for(const text of ["export default {x:process.exit()}","export default {get x(){return 1}}","export default {__proto__:{evil:true}}","const a=[(()=>42)()]"])expect(()=>readLiteralData(text)).toThrow();});
});
''')
