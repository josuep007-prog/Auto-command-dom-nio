-- Esquema inicial do acervo.
--
-- Duas decisoes atravessam o arquivo inteiro:
--
-- 1. DINHEIRO E INTEIRO, EM CENTAVOS. Ponto flutuante nao representa 0,07
--    exatamente, e somar milhares de lancamentos assim acumula erro. Numa folha
--    de pagamento isso é diferenca em contracheque. Por isso nada aqui e REAL.
--
-- 2. FATO NUNCA E EDITADO. Toda linha de fato aponta para a importacao que a
--    trouxe. Reimportar um relatorio corrigido cria uma importacao nova e marca
--    a anterior como nao vigente — que continua consultavel. E isso que da o
--    rastro de retificacao (S-1298) sem nenhum UPDATE destrutivo.
--
-- CNPJ e CPF sao guardados so com digitos; formatar e assunto de tela.

CREATE TABLE usuario (
  id          INTEGER PRIMARY KEY,
  login       TEXT    NOT NULL UNIQUE,
  nome        TEXT    NOT NULL,
  senha_hash  TEXT    NOT NULL,
  senha_sal   TEXT    NOT NULL,
  papel       TEXT    NOT NULL DEFAULT 'operador',   -- operador | administrador
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT    NOT NULL
);

CREATE TABLE sessao (
  id          TEXT    PRIMARY KEY,                   -- token aleatorio
  usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
  criada_em   TEXT    NOT NULL,
  expira_em   TEXT    NOT NULL,
  origem      TEXT
);
CREATE INDEX sessao_usuario ON sessao(usuario_id);

-- Auditoria cobre LEITURA tambem, nao so escrita: o acervo tem folha de varios
-- clientes, e "quem consultou o que" e parte do controle de acesso.
CREATE TABLE auditoria (
  id          INTEGER PRIMARY KEY,
  quando      TEXT    NOT NULL,
  usuario_id  INTEGER REFERENCES usuario(id),
  acao        TEXT    NOT NULL,      -- leu | criou | alterou | removeu | importou
  entidade    TEXT    NOT NULL,
  entidade_id INTEGER,
  antes       TEXT,                  -- JSON
  depois      TEXT                   -- JSON
);
CREATE INDEX auditoria_quando ON auditoria(quando);
CREATE INDEX auditoria_entidade ON auditoria(entidade, entidade_id);

-- O cadastro que resolve a dor original: o CNPJ vem do proprio PDF e busca
-- daqui o codigo no Dominio, o tipo de processo e o plano de saude.
CREATE TABLE empresa (
  id                       INTEGER PRIMARY KEY,
  cnpj                     TEXT    NOT NULL UNIQUE,  -- 14 digitos
  razao_social             TEXT    NOT NULL,
  codigo_dominio           TEXT    NOT NULL,         -- texto: preserva zero a esquerda
  tipo_processo_padrao     TEXT    NOT NULL DEFAULT '11',
  descricao_servico_padrao TEXT,                     -- usada no RPA
  plano_cnpj               TEXT,                     -- operadora, 14 digitos
  plano_rubricas           TEXT,                     -- codigos separados por virgula
  ativa                    INTEGER NOT NULL DEFAULT 1,
  criada_em                TEXT    NOT NULL,
  atualizada_em            TEXT    NOT NULL
);

-- Identidade estavel ao longo dos meses. O codigo do cadastro e a chave
-- confiavel; nome_chave (chave() do nucleo) serve para casar quem aparece num
-- relatorio que nao traz codigo — o recibo de RPA, por exemplo.
CREATE TABLE pessoa (
  id             INTEGER PRIMARY KEY,
  empresa_id     INTEGER NOT NULL REFERENCES empresa(id),
  codigo_dominio TEXT    NOT NULL,
  nome           TEXT    NOT NULL,
  nome_chave     TEXT    NOT NULL,
  cpf            TEXT,                                -- 11 digitos
  UNIQUE (empresa_id, codigo_dominio)
);
CREATE INDEX pessoa_nome ON pessoa(empresa_id, nome_chave);

CREATE TABLE rubrica (
  id          INTEGER PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresa(id),
  codigo      TEXT    NOT NULL,
  descricao   TEXT    NOT NULL,
  tipo        TEXT,                  -- fixa | variavel | automatica | indefinida
  natureza    TEXT,                  -- provento | desconto | informativo (Fase 4)
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE competencia (
  id         INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresa(id),
  aaaamm     TEXT    NOT NULL,       -- 202603; 202613 e o 13o salario
  UNIQUE (empresa_id, aaaamm)
);

CREATE TABLE importacao (
  id             INTEGER PRIMARY KEY,
  empresa_id     INTEGER NOT NULL REFERENCES empresa(id),
  competencia_id INTEGER NOT NULL REFERENCES competencia(id),
  tipo_documento TEXT    NOT NULL,   -- liquidos | contracheque | rpa
  arquivo_nome   TEXT,
  arquivo_hash   TEXT    NOT NULL,   -- sha256; como o PDF nao e guardado, e ele
                                     -- que identifica a origem e evita repetir
  paginas        INTEGER,
  quando         TEXT    NOT NULL,
  usuario_id     INTEGER REFERENCES usuario(id),
  substitui_id   INTEGER REFERENCES importacao(id),
  vigente        INTEGER NOT NULL DEFAULT 1
);

-- Indice parcial: so pode existir UMA importacao vigente por empresa,
-- competencia e tipo de documento. As substituidas ficam, com vigente = 0.
CREATE UNIQUE INDEX importacao_vigente
  ON importacao(empresa_id, competencia_id, tipo_documento) WHERE vigente = 1;
CREATE INDEX importacao_hash ON importacao(arquivo_hash);

CREATE TABLE pessoa_competencia (
  id               INTEGER PRIMARY KEY,
  importacao_id    INTEGER NOT NULL REFERENCES importacao(id),
  competencia_id   INTEGER NOT NULL REFERENCES competencia(id),
  pessoa_id        INTEGER NOT NULL REFERENCES pessoa(id),
  grupo            TEXT,             -- empregados | contribuintes | estagiarios
  funcao           TEXT,
  liquido_centavos INTEGER
);
CREATE INDEX pessoa_competencia_pessoa ON pessoa_competencia(pessoa_id);
CREATE INDEX pessoa_competencia_importacao ON pessoa_competencia(importacao_id);

CREATE TABLE lancamento (
  id             INTEGER PRIMARY KEY,
  importacao_id  INTEGER NOT NULL REFERENCES importacao(id),
  competencia_id INTEGER NOT NULL REFERENCES competencia(id),
  pessoa_id      INTEGER NOT NULL REFERENCES pessoa(id),
  rubrica_id     INTEGER NOT NULL REFERENCES rubrica(id),
  referencia     TEXT,               -- horas, dias, percentual — como veio (Fase 4)
  valor_centavos INTEGER NOT NULL,
  natureza       TEXT
);
CREATE INDEX lancamento_pessoa ON lancamento(pessoa_id, competencia_id);
CREATE INDEX lancamento_importacao ON lancamento(importacao_id);
CREATE INDEX lancamento_rubrica ON lancamento(rubrica_id);

CREATE TABLE rpa_recibo (
  id             INTEGER PRIMARY KEY,
  importacao_id  INTEGER NOT NULL REFERENCES importacao(id),
  competencia_id INTEGER NOT NULL REFERENCES competencia(id),
  pessoa_id      INTEGER NOT NULL REFERENCES pessoa(id),
  numero         TEXT,
  data_pagamento TEXT,               -- AAAAMMDD
  descricao      TEXT,
  valor_centavos INTEGER
);
CREATE INDEX rpa_recibo_pessoa ON rpa_recibo(pessoa_id);
CREATE INDEX rpa_recibo_importacao ON rpa_recibo(importacao_id);
