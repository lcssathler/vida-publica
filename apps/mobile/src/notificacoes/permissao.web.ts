/**
 * Na versão web (só desenvolvimento) não há pedido do sistema nem envio: a
 * escolha da pessoa vale como preferência.
 */
export async function pedirPermissaoDoSistema(): Promise<boolean> {
  return true;
}
