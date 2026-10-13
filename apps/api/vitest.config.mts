import ts from 'typescript';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * O NestJS depende dos metadados de tipo emitidos pelos decorators
 * (emitDecoratorMetadata), que o transformador padrão do Vite não gera.
 * Usamos o compilador do próprio TypeScript, em JavaScript puro, para não
 * depender de binários nativos.
 */
function typescriptDecorators(): Plugin {
  return {
    name: 'typescript-decorators',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('node_modules')) return null;
      const output = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2023,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          sourceMap: true,
          inlineSources: true,
        },
      });
      return { code: output.outputText, map: output.sourceMapText };
    },
  };
}

export default defineConfig({
  oxc: false,
  plugins: [typescriptDecorators()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
