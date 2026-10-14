-- migrate:up

-- Feed do app: paginação por cursor (ocorrido_em, id), só eventos publicados.
-- Substitui o índice só por data: com o id no índice, a página seguinte começa
-- exatamente onde a anterior parou, mesmo com vários eventos no mesmo instante.
DROP INDEX feed.evento_feed_idx;
CREATE INDEX evento_feed_idx ON feed.evento (ocorrido_em DESC, id DESC) WHERE status = 'publicado';

-- migrate:down

DROP INDEX feed.evento_feed_idx;
CREATE INDEX evento_feed_idx ON feed.evento (ocorrido_em DESC) WHERE status = 'publicado';
