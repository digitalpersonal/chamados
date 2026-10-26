/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Database, ShieldCheck, Download, RefreshCw, CheckCircle2, 
  Clock, AlertCircle, FileJson, Check, ArrowDownToLine, HardDrive
} from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';
import { 
  performBackup, downloadBackupFile, getLocalBackupHistory, 
  getLastBackupDate, BackupRecord 
} from '../lib/backupService';
import { Ticket, Equipment, Technician } from '../App';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    tickets: Ticket[];
    equipment: Equipment[];
    technicians: Technician[];
    departments: string[];
  };
}

export default function BackupModal({ isOpen, onClose, data }: BackupModalProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<BackupRecord[]>(() => getLocalBackupHistory());
  const lastDate = getLastBackupDate();

  if (!isOpen) return null;

  const handleRunManualBackup = async () => {
    setIsRunning(true);
    setStatusMessage(null);
    try {
      const res = await performBackup(data, true);
      setStatusMessage(res.message);
      setHistory(getLocalBackupHistory());
    } catch (e: any) {
      setStatusMessage(`Erro ao realizar backup: ${e.message || 'Falha desconhecida'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownload = () => {
    downloadBackupFile(data);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '1.2 KB';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col min-w-0">
        {/* Header */}
        <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-lg text-white truncate">
                Rotina de Backup Diário & Segurança
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Armazenamento de segurança de chamados e ativos
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0 text-base">✕</button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6 text-xs sm:text-sm">
          {/* Status banner */}
          <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-bold text-white text-sm">Rotina Diária Ativa</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Automático
                </span>
              </div>
              <p className="text-slate-400 text-xs">
                O sistema verifica e realiza o backup diário automaticamente ao iniciar o expediente.
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-300 pt-1">
                <span>Último backup: <strong className="text-emerald-400">{lastDate ? new Date(lastDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Hoje'}</strong></span>
                <span>•</span>
                <span>Armazenamento: <strong className={isSupabaseConfigured() ? 'text-emerald-400' : 'text-amber-400'}>{isSupabaseConfigured() ? 'Supabase Conectado' : 'Local + Supabase Pronto'}</strong></span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={handleRunManualBackup}
                disabled={isRunning}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-bold rounded-xl transition-all shadow text-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                <span>{isRunning ? 'Executando...' : 'Fazer Backup Agora'}</span>
              </button>
              <button
                onClick={handleDownload}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-xl transition-colors text-xs flex items-center justify-center gap-1.5 shrink-0"
                title="Baixar arquivo JSON com todos os dados atuais"
              >
                <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
                <span>Baixar JSON</span>
              </button>
            </div>
          </div>

          {statusMessage && (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Current System Totals Snapshot */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> Dados Incluídos no Backup Atual:
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Chamados</span>
                <span className="text-lg font-bold text-white tabular-nums">{data.tickets.length}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Equipamentos</span>
                <span className="text-lg font-bold text-white tabular-nums">{data.equipment.length}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Técnicos</span>
                <span className="text-lg font-bold text-white tabular-nums">{data.technicians.length}</span>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Secretarias/Setores</span>
                <span className="text-lg font-bold text-white tabular-nums">{data.departments.length}</span>
              </div>
            </div>
          </div>

          {/* Backup History Log */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" /> Histórico de Cópias de Segurança:
              </h4>
              <span className="text-[11px] text-slate-500">
                {history.length} {history.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 bg-slate-900/60 max-h-56 overflow-y-auto">
              {history.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Nenhum registro de backup anterior. Clique em "Fazer Backup Agora" para criar a primeira cópia.
                </div>
              ) : (
                history.map((record) => (
                  <div key={record.id} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-900 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                        <FileJson className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-white text-[11px] font-semibold truncate">
                            {record.filename}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {record.backupType}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{new Date(record.timestamp).toLocaleString('pt-BR')}</span>
                          <span>•</span>
                          <span>{record.ticketsCount} chamados</span>
                          <span>•</span>
                          <span>{formatFileSize(record.sizeBytes)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${record.supabaseSynced ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-300'}`}>
                        {record.supabaseSynced ? 'Supabase OK' : 'Salvo Local'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-800 flex justify-between items-center bg-slate-950 rounded-b-3xl">
          <span className="text-[11px] text-slate-500">
            Segurança de dados • Prefeitura Municipal de Guaranésia
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
