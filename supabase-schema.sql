-- =====================================================================
-- PREFEITURA MUNICIPAL DE GUARANESIA - SCM (Supabase Production Schema)
-- Execute este script no SQL Editor do seu projeto Supabase
-- =====================================================================

-- 1. Tabela de Secretarias e Setores
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir setores padrão da prefeitura
INSERT INTO departments (name) VALUES 
    ('Gabinete do Prefeito'),
    ('Secretaria de Administração'),
    ('Secretaria de Finanças'),
    ('Secretaria de Educação'),
    ('Secretaria de Saúde'),
    ('Secretaria de Obras e Serviços'),
    ('Secretaria de Assistência Social'),
    ('Secretaria de Agricultura e Meio Ambiente'),
    ('Departamento de Recursos Humanos'),
    ('Sala do Cidadão / TI')
ON CONFLICT (name) DO NOTHING;

-- 2. Tabela de Técnicos e Terceirizados
CREATE TABLE IF NOT EXISTS technicians (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Interno', 'Terceirizado')),
    company TEXT,
    phone TEXT,
    email TEXT,
    specialty TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Equipamentos e Ativos
CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    model TEXT,
    serial_number TEXT,
    department TEXT NOT NULL,
    ip_address TEXT,
    status TEXT NOT NULL DEFAULT 'Operacional',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Chamados de Manutenção
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    equipment_id TEXT REFERENCES equipment(id) ON DELETE SET NULL,
    equipment_type TEXT NOT NULL,
    department TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Aberto',
    priority TEXT NOT NULL DEFAULT 'Média',
    technician_id TEXT REFERENCES technicians(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolution_notes TEXT,
    cost NUMERIC(10,2) DEFAULT 0,
    ai_diagnosis JSONB
);

-- 5. Tabela de Anotações / Histórico do Chamado
CREATE TABLE IF NOT EXISTS ticket_notes (
    id TEXT PRIMARY KEY,
    ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS) opcional (ou desativar para uso administrativo exclusivo)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso público total para ambiente administrativo exclusivo da prefeitura
CREATE POLICY "Enable all access for admin on departments" ON departments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for admin on technicians" ON technicians FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for admin on equipment" ON equipment FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for admin on tickets" ON tickets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for admin on ticket_notes" ON ticket_notes FOR ALL USING (true) WITH CHECK (true);

-- 6. Tabela de Histórico de Backups Diários Automáticos
CREATE TABLE IF NOT EXISTS system_backups (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    backup_type TEXT NOT NULL DEFAULT 'Rotina Diária Automática',
    tickets_count INTEGER NOT NULL DEFAULT 0,
    equipment_count INTEGER NOT NULL DEFAULT 0,
    technicians_count INTEGER NOT NULL DEFAULT 0,
    departments_count INTEGER NOT NULL DEFAULT 0,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE system_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for admin on system_backups" ON system_backups FOR ALL USING (true) WITH CHECK (true);

-- 7. Tabela de Sincronização em Tempo Real (Estado Geral Unificado)
CREATE TABLE IF NOT EXISTS system_state (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for admin on system_state" ON system_state FOR ALL USING (true) WITH CHECK (true);

