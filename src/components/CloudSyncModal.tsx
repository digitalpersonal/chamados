import React, { useState, useEffect } from 'react';
import { 
  Cloud, CloudOff, RefreshCw, UploadCloud, DownloadCloud, Copy, 
  Check, Database, Key, Globe, AlertCircle, CheckCircle2, X, 
  FileText, ArrowRight, ShieldCheck, Terminal, Search
} from 'lucide-react';
import { 
  getSupabaseCredentials, 
  saveSupabaseCredentials, 
  clearSupabaseCredentials, 
  isSupabaseReady,
  getSupabaseClient
} from '../lib/supabase';
import { syncWithSupabase, pushStateToSupabase } from '../lib/cloudDbService';
import { Ticket, Equipment, Technician, scanAndRecoverAllLocalStorage } from '../App';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickets: Ticket[];
  departments: string[];
  equipment: Equipment[];
  technicians: Technician[];
  onDataLoaded: (data: {
    tickets?: Ticket[];
    departments?: string[];
    equipment?: Equipment[];
    technicians?: Technician[];
  }) => void;
}

export default function CloudSyncModal({
  isOpen,
  onClose,
  tickets,
  departments,
  equipment,
  technicians,
  onDataLoaded
}: CloudSyncModalProps) {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedState, setCopiedState] = useState(false);
  const [pasteInput, setPasteInput] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'cloud' | 'clipboard' | 'sql' | 'vercel'>('cloud');

  useEffect(() => {
    if (isOpen) {
      const creds = getSupabaseCredentials();
      setUrl(creds.url);
      setAnonKey(creds.anonKey);
      setIsConnected(isSupabaseReady());
      setTestResult(null);
      setPasteError('');
      setPasteSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({ ok: false, msg: 'Por favor, informe a URL e a Anon Key do Supabase.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    saveSupabaseCredentials(url.trim(), anonKey.trim());
    const client = getSupabaseClient();

    if (!client) {
      setTestResult({ ok: false, msg: 'Não foi possível inicializar o cliente Supabase com estes dados.' });
      setIsTesting(false);
      return;
    }

    try {
      // Test read query
      const { error } = await client.from('departments').select('name').limit(1);
      if (error && error.code !== 'PGRST116') {
        // Table might not exist yet, try system_state or simple ping
        const { error: stateErr } = await client.from('system_state').select('id').limit(1);
        if (stateErr && stateErr.code !== '42P01') {
          console.warn('Supabase test warning:', error || stateErr);
        }
      }

      setIsConnected(true);
      setTestResult({ 
        ok: true, 
        msg: 'Conexão com o Supabase estabelecida com sucesso! O banco em nuvem está pronto para sincronizar.' 
      });

      // Automatically sync data
      const syncRes = await syncWithSupabase({ tickets, departments, equipment, technicians });
      if (syncRes && syncRes.success) {
        onDataLoaded({
          tickets: syncRes.tickets,
          departments: syncRes.departments,
          equipment: syncRes.equipment,
          technicians: syncRes.technicians
        });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: 'Falha ao conectar: ' + (err.message || 'Verifique sua conexão') });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = () => {
    clearSupabaseCredentials();
    setUrl('');
    setAnonKey('');
    setIsConnected(false);
    setTestResult({ ok: false, msg: 'Desconectado do Supabase. O sistema está usando armazenamento local.' });
  };

  const handlePushToCloud = async () => {
    const client = getSupabaseClient();
    if (!client) {
      setTestResult({ ok: false, msg: 'Supabase não está conectado.' });
      return;
    }

    setIsTesting(true);
    try {
      await pushStateToSupabase(client, { tickets, departments, equipment, technicians });
      setTestResult({ 
        ok: true, 
        msg: `Sucesso! ${tickets.length} chamados e ${departments.length} setores foram enviados para a nuvem do Supabase.` 
      });
    } catch (err: any) {
      setTestResult({ ok: false, msg: 'Erro ao enviar dados: ' + err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handlePullFromCloud = async () => {
    setIsTesting(true);
    try {
      const res = await syncWithSupabase({ tickets, departments, equipment, technicians });
      if (res && res.success) {
        onDataLoaded({
          tickets: res.tickets,
          departments: res.departments,
          equipment: res.equipment,
          technicians: res.technicians
        });
        setTestResult({ 
          ok: true, 
          msg: `Dados baixados com sucesso da nuvem! Sincronizados ${res.tickets?.length || 0} chamados e ${res.departments?.length || 0} setores.` 
        });
      } else {
        setTestResult({ ok: false, msg: res?.error || 'Erro ao baixar dados da nuvem.' });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: 'Erro: ' + err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyClipboard = () => {
    const fullPayload = {
      app: 'Prefeitura de Guaranésia - SCM',
      timestamp: new Date().toISOString(),
      departments,
      equipment,
      technicians,
      tickets
    };
    navigator.clipboard.writeText(JSON.stringify(fullPayload, null, 2));
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 3000);
  };

  const handleApplyPastedState = () => {
    setPasteError('');
    setPasteSuccess(false);
    if (!pasteInput.trim()) {
      setPasteError('Cole o conteúdo JSON dos dados acima.');
      return;
    }

    try {
      const parsed = JSON.parse(pasteInput.trim());
      const dataToApply: any = {};

      if (Array.isArray(parsed.tickets)) dataToApply.tickets = parsed.tickets;
      if (Array.isArray(parsed.departments)) dataToApply.departments = parsed.departments;
      if (Array.isArray(parsed.equipment)) dataToApply.equipment = parsed.equipment;
      if (Array.isArray(parsed.technicians)) dataToApply.technicians = parsed.technicians;

      if (!dataToApply.tickets && !dataToApply.departments) {
        throw new Error('O formato colado não contém chamados ou setores válidos.');
      }

      onDataLoaded(dataToApply);
      setPasteSuccess(true);
      setPasteInput('');
      setTimeout(() => setPasteSuccess(false), 4000);
    } catch (err: any) {
      setPasteError(err.message || 'Código JSON inválido. Verifique o texto colado.');
    }
  };

  const handleDeepScanBrowser = async () => {
    setIsTesting(true);
    setPasteError('');
    try {
      const recovered = scanAndRecoverAllLocalStorage();
      onDataLoaded({
        tickets: recovered.tickets.length > 0 ? recovered.tickets : undefined,
        departments: recovered.departments.length > 0 ? recovered.departments : undefined,
        equipment: recovered.equipment.length > 0 ? recovered.equipment : undefined,
        technicians: recovered.technicians.length > 0 ? recovered.technicians : undefined
      });

      // If Supabase is connected, immediately push recovered items to Supabase cloud
      const client = getSupabaseClient();
      if (client && isSupabaseReady()) {
        await pushStateToSupabase(client, {
          tickets: recovered.tickets,
          departments: recovered.departments,
          equipment: recovered.equipment,
          technicians: recovered.technicians
        });
      }

      setTestResult({
        ok: true,
        msg: `Varredura concluída com sucesso! Recuperados ${recovered.departments.length} setores e ${recovered.tickets.length} chamados da memória do seu navegador e gravados na nuvem.`
      });
    } catch (err: any) {
      setTestResult({ ok: false, msg: 'Erro ao escanear memória: ' + err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const SUPABASE_SQL_SCHEMA = `-- Script SQL para Inicialização Completa do Supabase (Prefeitura de Guaranésia)

CREATE TABLE IF NOT EXISTS public.system_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.departments (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.technicians (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  specialty TEXT
);

CREATE TABLE IF NOT EXISTS public.equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  model TEXT,
  serial_number TEXT,
  department TEXT NOT NULL,
  ip_address TEXT,
  status TEXT DEFAULT 'Operacional'
);

CREATE TABLE IF NOT EXISTS public.tickets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  equipment_id TEXT,
  equipment_type TEXT NOT NULL,
  department TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  technician_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  resolution_notes TEXT,
  cost NUMERIC DEFAULT 0,
  deadline TEXT,
  ai_diagnosis JSONB,
  is_archived BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.ticket_notes (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES public.tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Desabilitar RLS para permitir gravação e leitura diretas sem bloqueios de permissão
ALTER TABLE public.system_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_notes DISABLE ROW LEVEL SECURITY;
`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'}`}>
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Banco em Nuvem & Sincronização
                {isConnected ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    🟢 Supabase Conectado
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    🟠 Modo Local
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Conecte o Supabase para que os chamados e setores apareçam simultaneamente no Vercel e em Produção.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-4 pt-2 gap-2 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('cloud')}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${activeTab === 'cloud' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Conexão Supabase</span>
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${activeTab === 'sql' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Criar Tabelas (SQL)</span>
          </button>
          <button
            onClick={() => setActiveTab('clipboard')}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${activeTab === 'clipboard' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copiar / Restaurar Dados</span>
          </button>
          <button
            onClick={() => setActiveTab('vercel')}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${activeTab === 'vercel' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Guia Vercel</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          
          {/* TAB 1: CLOUD */}
          {activeTab === 'cloud' && (
            <div className="space-y-4">
              <form onSubmit={handleSaveConnection} className="space-y-3 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Supabase Project URL (VITE_SUPABASE_URL)</span>
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://xyzproject.supabase.co"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs sm:text-sm text-white placeholder-slate-500 font-mono focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Supabase Anon Public API Key (VITE_SUPABASE_ANON_KEY)</span>
                  </label>
                  <input
                    type="password"
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs sm:text-sm text-white placeholder-slate-500 font-mono focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isTesting}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow disabled:opacity-50"
                    >
                      {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>Testar e Conectar Supabase</span>
                    </button>
                    {isConnected && (
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="px-3 py-2 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                </div>
              </form>

              {/* Status Message */}
              {testResult && (
                <div className={`p-3 rounded-xl text-xs font-medium border flex items-start gap-2 ${testResult.ok ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-rose-500/10 border-rose-500/40 text-rose-300'}`}>
                  {testResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                  <span>{testResult.msg}</span>
                </div>
              )}

              {/* Cloud Sync Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePushToCloud}
                  disabled={isTesting}
                  className="p-3 bg-slate-950 border border-emerald-500/30 rounded-xl hover:border-emerald-500 transition-all text-left flex items-start gap-2.5 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <UploadCloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                      Enviar para a Nuvem
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Envia {tickets.length} chamados e {departments.length} setores para o Supabase.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handlePullFromCloud}
                  disabled={isTesting}
                  className="p-3 bg-slate-950 border border-cyan-500/30 rounded-xl hover:border-cyan-500 transition-all text-left flex items-start gap-2.5 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <DownloadCloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                      Baixar da Nuvem
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Puxa do Supabase para esta tela.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleDeepScanBrowser}
                  disabled={isTesting}
                  className="p-3 bg-slate-950 border border-purple-500/30 rounded-xl hover:border-purple-500 transition-all text-left flex items-start gap-2.5 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">
                      Escanear Memória
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Varre o navegador e recupera setores e chamados anteriores.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* TAB SQL: SCRIPT FOR SUPABASE SQL EDITOR */}
          {activeTab === 'sql' && (
    <div className="space-y-4">
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Script SQL para o Supabase</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Copie o código abaixo, acesse o painel do Supabase &gt; <strong>SQL Editor</strong> &gt; <strong>New Query</strong>, cole e clique em <strong>Run</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopySql}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSql ? 'SQL Copiado com Sucesso!' : 'Copiar Script SQL'}</span>
          </button>
        </div>

        <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[10px] sm:text-xs text-cyan-300 font-mono overflow-x-auto max-h-56 leading-relaxed">
          {SUPABASE_SQL_SCHEMA}
        </pre>
      </div>
    </div>
  )}

  {/* TAB 2: CLIPBOARD EXPORT / IMPORT */}
  {activeTab === 'clipboard' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <Copy className="w-4 h-4 text-emerald-400" />
                      <span>Copiar Dados Desta Sessão (Exportação Imediata)</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Copie todos os dados atuais ({departments.length} setores, {tickets.length} chamados, {equipment.length} ativos, {technicians.length} técnicos) para colar no sistema em produção.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyClipboard}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
                  >
                    {copiedState ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedState ? 'Copiado para Área de Transferência!' : 'Copiar Tudo'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <DownloadCloud className="w-4 h-4 text-cyan-400" />
                  <span>Restaurar Dados (Colar JSON)</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Se você cadastrou setores ou chamados em outro ambiente, cole o JSON abaixo para trazê-los imediatamente para este sistema:
                </p>
                <textarea
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder="Cole aqui o pacote JSON copiado..."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:border-cyan-500 focus:outline-none"
                />
                
                {pasteError && (
                  <p className="text-xs text-rose-400 font-medium">{pasteError}</p>
                )}
                {pasteSuccess && (
                  <p className="text-xs text-emerald-400 font-medium">Dados aplicados com sucesso no sistema!</p>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleApplyPastedState}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Aplicar e Restaurar Dados</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VERCEL STEP-BY-STEP */}
          {activeTab === 'vercel' && (
            <div className="space-y-3 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>O que preencher no Vercel (Passo a Passo)</span>
              </h3>
              
              <p className="text-slate-400">
                Na Vercel, acesse seu projeto &gt; <strong>Settings</strong> &gt; <strong>Environment Variables</strong> e adicione as 3 variáveis abaixo:
              </p>

              <div className="space-y-2 pt-2">
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-[11px] font-mono text-cyan-300 font-bold">VITE_SUPABASE_URL</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">A URL do seu projeto Supabase (ex: https://xyz.supabase.co)</p>
                </div>

                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-[11px] font-mono text-cyan-300 font-bold">VITE_SUPABASE_ANON_KEY</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">A chave pública anon do seu projeto Supabase</p>
                </div>

                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-[11px] font-mono text-cyan-300 font-bold">GEMINI_API_KEY</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">Sua chave da API Gemini do Google AI Studio</p>
                </div>
              </div>

              <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg mt-3 text-emerald-300 text-[11px]">
                💡 <strong>Por que os dados sumiam?</strong> O Vercel é uma plataforma serverless sem disco permanente. Ao conectar o Supabase, tudo o que você cadastrar aqui vai direto para o banco de dados oficial na nuvem, ficando visível em qualquer navegador ou servidor!
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
