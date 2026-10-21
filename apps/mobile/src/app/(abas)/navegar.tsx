import { TelaFeed } from '../../feed/TelaFeed';

/** Navegar: tudo o que foi registrado, de quem a pessoa segue ou não. */
export default function Navegar() {
  return <TelaFeed escopo="todos" />;
}
