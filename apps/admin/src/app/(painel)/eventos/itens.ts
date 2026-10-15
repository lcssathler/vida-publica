/** Cada caixa marcada vale "<id>:<content_hash>". */
export function itensDoFormulario(
  valores: Array<FormDataEntryValue>,
): Array<{ id: string; contentHash: string }> {
  const itens = new Map<string, string>();
  for (const valor of valores) {
    const m = /^([0-9a-f-]{36}):([0-9a-f]{64})$/.exec(String(valor));
    if (m) itens.set(m[1], m[2]);
  }
  return [...itens].map(([id, contentHash]) => ({ id, contentHash })).slice(0, 100);
}
