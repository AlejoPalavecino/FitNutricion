import { parse } from 'acorn';
/** Reads a JS data declaration without running downloaded JavaScript. */
export function readLiteralData(source: string): unknown {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as Node;
  const declarations = new Map<string, Node>();
  let selected: Node | undefined;
  for (const statement of program.body ?? []) {
    const declaration =
      statement.type === 'ExportDefaultDeclaration'
        ? undefined
        : statement.type === 'ExportNamedDeclaration'
          ? statement.declaration
          : statement;
    if (declaration?.type === 'VariableDeclaration')
      for (const item of declaration.declarations ?? []) {
        if (item.id?.type === 'Identifier' && item.init) {
          declarations.set(item.id.name!, item.init);
          selected ??= item.init;
        }
      }
    if (statement.type === 'ExportDefaultDeclaration') selected = statement.declaration;
  }
  if (selected?.type === 'Identifier') selected = declarations.get(selected.name!);
  if (!selected) throw new Error('No data declaration found.');
  function literal(node: Node, depth = 0): unknown {
    if (depth > 50) throw new Error('Data nesting limit exceeded.');
    switch (node.type) {
      case 'Literal':
        if (node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value))
          return node.value;
        break;
      case 'UnaryExpression':
        if (
          node.operator === '-' &&
          node.argument?.type === 'Literal' &&
          typeof node.argument.value === 'number'
        )
          return -node.argument.value;
        break;
      case 'ArrayExpression':
        return (node.elements ?? []).map((item) => {
          if (!item) throw new Error('Array holes rejected.');
          return literal(item, depth + 1);
        });
      case 'ObjectExpression': {
        const result: Record<string, unknown> = Object.create(null);
        for (const property of node.properties ?? []) {
          if (
            property.type !== 'Property' ||
            property.kind !== 'init' ||
            property.method ||
            property.computed ||
            property.shorthand
          )
            throw new Error('Only literal properties are allowed.');
          const key = property.key?.type === 'Identifier' ? property.key.name : property.key?.value;
          if (
            typeof key !== 'string' ||
            ['__proto__', 'constructor', 'prototype'].includes(key) ||
            !property.valueNode
          )
            throw new Error('Unsafe object key.');
          result[key] = literal(property.valueNode, depth + 1);
        }
        return result;
      }
    }
    throw new Error(`Executable or unsupported syntax rejected: ${node.type}`);
  }
  // Acorn calls the property's expression "value"; normalize only AST structure.
  function normalize(node: Node) {
    if (node.type === 'Property') node.valueNode = node.value as unknown as Node;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'valueNode') continue;
      if (Array.isArray(value))
        value.forEach((v) => {
          if (v && typeof v === 'object' && 'type' in v) normalize(v);
        });
      else if (value && typeof value === 'object' && 'type' in value) normalize(value as Node);
    }
  }
  normalize(selected);
  return literal(selected);
}
interface Node {
  type: string;
  body?: Node[];
  declaration?: Node;
  declarations?: Node[];
  id?: Node;
  init?: Node;
  name?: string;
  value?: unknown;
  valueNode?: Node;
  elements?: (Node | null)[];
  properties?: Node[];
  key?: Node;
  kind?: string;
  method?: boolean;
  computed?: boolean;
  shorthand?: boolean;
  operator?: string;
  argument?: Node;
}
