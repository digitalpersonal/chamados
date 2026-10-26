/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Printer, Clock, Phone, Monitor, Globe, Wrench, 
  CheckCircle2, Send, Search, ArrowLeft, ShieldCheck, 
  HelpCircle, Building2, User, PhoneCall, AlertCircle, Copy, Check
} from 'lucide-react';
import { EquipmentType, Priority, Ticket, TicketStatus, calculateDefaultDeadline, formatSlaDate, getSlaStatus } from '../App';
import { saveTicketToSupabase } from '../lib/cloudDbService';
import { fetchAndApplyServerCredentials } from '../lib/supabase';

interface PortalServidorProps {
  departments: string[];
  tickets: Ticket[];
  onTicketCreated: (ticket: Ticket) => void;
  isAdminPreview?: boolean;
  onSwitchToAdmin?: () => void;
  onSwitchToTechnician?: () => void;
}

export default function PortalServidor({
  departments,
  tickets,
  onTicketCreated,
  isAdminPreview,
  onSwitchToAdmin,
  onSwitchToTechnician
}: PortalServidorProps) {
  // Guarafood style: automatically load from localStorage if previously saved on this device
  const [requesterName, setRequesterName] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedProfile = localStorage.getItem('guaranesia_user_profile');
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile);
          if (parsed && parsed.name) return parsed.name;
        }
        const cached = localStorage.getItem('guaranesia_saved_requesters');
        if (cached) {
          const arr = JSON.parse(cached);
          if (arr && arr.length > 0 && arr[0].name) return arr[0].name;
        }
      } catch (e) {}
    }
    return '';
  });

  const [requesterContact, setRequesterContact] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedProfile = localStorage.getItem('guaranesia_user_profile');
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile);
          if (parsed && parsed.whatsapp) return parsed.whatsapp;
        }
        const cached = localStorage.getItem('guaranesia_saved_requesters');
        if (cached) {
          const arr = JSON.parse(cached);
          if (arr && arr.length > 0 && arr[0].whatsapp) return arr[0].whatsapp;
        }
      } catch (e) {}
    }
    return '';
  });

  const sortedDepartments = React.useMemo(() => {
    return [...departments].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
  }, [departments]);

  const [department, setDepartment] = useState(() => {
    const sorted = [...departments].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
    return sorted[0] || 'Gabinete do Prefeito';
  });

  useEffect(() => {
    fetchAndApplyServerCredentials();
  }, []);

  useEffect(() => {
    if (sortedDepartments.length > 0 && !sortedDepartments.includes(department)) {
      setDepartment(sortedDepartments[0]);
    }
  }, [sortedDepartments, department]);
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('Impressora');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('Média');
  
  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successTicket, setSuccessTicket] = useState<Ticket | null>(null);
  const [copiedProtocol, setCopiedProtocol] = useState(false);

  // Search state by protocol
  const [searchProtocol, setSearchProtocol] = useState('');
  const [searchedTicket, setSearchedTicket] = useState<Ticket | null | 'not_found'>(null);

  interface SavedRequester {
    name: string;
    whatsapp: string;
  }

  const [savedRequesters, setSavedRequesters] = useState<SavedRequester[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('guaranesia_saved_requesters');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  const handleRequesterNameChange = (val: string) => {
    setRequesterName(val);
    const found = savedRequesters.find(r => r.name.toLowerCase() === val.toLowerCase());
    if (found) {
      setRequesterContact(found.whatsapp);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!requesterName.trim()) {
      setErrorMsg('Por favor, informe seu nome.');
      return;
    }
    if (!title.trim() || !description.trim()) {
      setErrorMsg('Por favor, preencha o resumo e da descrição do problema.');
      return;
    }

    setIsSubmitting(true);
    try {
      let createdTicket: Ticket | null = null;

      try {
        const response = await fetch('/api/tickets/public', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            equipmentType,
            department,
            requesterName,
            requesterContact,
            priority
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.success && data.ticket) {
            createdTicket = data.ticket;
          }
        }
      } catch (err) {
        console.warn('Backend API endpoint unreachable (expected on static Vercel host), falling back to cloud database:', err);
      }

      // If backend API is not running (e.g. static Vite hosting on Vercel), construct ticket directly
      if (!createdTicket) {
        const now = new Date().toISOString();
        const code = `CH-2026-${String(tickets.length + 1).padStart(3, '0')}`;
        createdTicket = {
          id: `t-pub-${Date.now()}`,
          code,
          equipmentType,
          department,
          title,
          description,
          status: 'Aberto',
          priority,
          createdAt: now,
          updatedAt: now,
          deadline: calculateDefaultDeadline(priority, new Date(now)),
          notes: [
            {
              id: `n-${Date.now()}`,
              author: requesterName.trim() + (requesterContact ? ` (${requesterContact.trim()})` : ''),
              text: `Abertura de chamado pelo Portal do Servidor. Contato: ${requesterContact.trim() || 'Não informado'}`,
              timestamp: now
            }
          ]
        };
      }

      // Persist directly to Supabase Cloud Database
      saveTicketToSupabase(createdTicket, [createdTicket, ...tickets]);

      setSuccessTicket(createdTicket);
      onTicketCreated(createdTicket);

      // Save requester info to localStorage for instant auto-fill on next visits (Guarafood style)
      if (requesterName.trim() && requesterContact.trim()) {
        const cleanName = requesterName.trim();
        const cleanWhatsapp = requesterContact.trim();
        const updated = savedRequesters.filter(r => r.name.toLowerCase() !== cleanName.toLowerCase());
        updated.unshift({ name: cleanName, whatsapp: cleanWhatsapp });
        const sliced = updated.slice(0, 10);
        setSavedRequesters(sliced);
        try {
          localStorage.setItem('guaranesia_saved_requesters', JSON.stringify(sliced));
          localStorage.setItem('guaranesia_user_profile', JSON.stringify({ name: cleanName, whatsapp: cleanWhatsapp }));
        } catch (e) {}
      }

      // Reset form (except keep requester info saved for convenience)
      setTitle('');
      setDescription('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao registrar chamado. Verifique sua conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedProtocol(true);
    setTimeout(() => setCopiedProtocol(false), 2500);
  };

  const handleSearchProtocol = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchProtocol.trim()) return;
    const cleanSearch = searchProtocol.trim().toUpperCase();
    const found = tickets.find(t => t.code.toUpperCase() === cleanSearch);
    if (found) {
      setSearchedTicket(found);
    } else {
      setSearchedTicket('not_found');
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'Aberto': return <span className="px-2.5 py-1 text-xs font-semibold bg-amber-500/20 text-amber-300 rounded-md border border-amber-500/40">Aberto</span>;
      case 'Em Andamento': return <span className="px-2.5 py-1 text-xs font-semibold bg-blue-500/20 text-blue-300 rounded-md border border-blue-500/40">Em Andamento</span>;
      case 'Aguardando Peças': return <span className="px-2.5 py-1 text-xs font-semibold bg-purple-500/20 text-purple-300 rounded-md border border-purple-500/40">Aguardando Peças</span>;
      case 'Resolvido': return <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/40">Resolvido</span>;
      case 'Fechado': return <span className="px-2.5 py-1 text-xs font-semibold bg-slate-800 text-slate-300 rounded-md border border-slate-700">Fechado</span>;
      case 'Cancelado': return <span className="px-2.5 py-1 text-xs font-semibold bg-rose-500/20 text-rose-300 rounded-md border border-rose-500/40">Cancelado</span>;
    }
  };

  const serviceCategories: { type: EquipmentType; label: string; icon: React.ReactNode; desc: string }[] = [
    { type: 'Impressora', label: 'Impressora', icon: <Printer className="w-5 h-5 text-emerald-400" />, desc: 'Falha de impressão, atolamento ou conexão' },
    { type: 'Troca de Toner', label: 'Troca de Toner', icon: <Printer className="w-5 h-5 text-teal-400" />, desc: 'Solicitar toner preto ou colorido novo' },
    { type: 'Relógio de Ponto', label: 'Relógio de Ponto', icon: <Clock className="w-5 h-5 text-blue-400" />, desc: 'Problema na biometria ou registro de ponto' },
    { type: 'Telefone IP', label: 'Telefone IP / Ramal', icon: <Phone className="w-5 h-5 text-indigo-400" />, desc: 'Ramal mudo, chiado ou configuração de linha' },
    { type: 'Computador', label: 'Computador / TI', icon: <Monitor className="w-5 h-5 text-purple-400" />, desc: 'Lentidão, monitor, sistema operacional ou rede' },
    { type: 'Atualização do Site', label: 'Atualização do Site', icon: <Globe className="w-5 h-5 text-cyan-400" />, desc: 'Publicar notícias, diário oficial, editais ou decretos' },
    { type: 'Outros', label: 'Outros Serviços', icon: <Wrench className="w-5 h-5 text-amber-400" />, desc: 'Outras demandas técnicas ou suporte geral' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans w-full max-w-full overflow-x-hidden">
      {/* Admin Preview Exit Bar (ONLY visible if admin opened the preview from inside their panel) */}
      {isAdminPreview && onSwitchToAdmin && (
        <div className="bg-slate-900 border-b border-emerald-500/30 px-3 sm:px-4 py-2">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Modo de Teste: Visualizando como o servidor municipal vê a página</span>
            </span>
            <button
              onClick={onSwitchToAdmin}
              className="px-3 py-1 bg-emerald-500 text-slate-950 font-bold rounded-lg hover:bg-emerald-400 transition-colors text-xs shrink-0 shadow w-full sm:w-auto text-center"
            >
              Voltar ao Meu Painel Admin
            </button>
          </div>
        </div>
      )}

      {/* Header for Public Portal */}
      <header className="bg-slate-900 border-b border-slate-800 px-3.5 sm:px-8 py-3.5 sm:py-4 w-full max-w-full">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md shrink-0 text-sm sm:text-base">
              MG
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate">
                  Prefeitura de Guaranésia
                </h1>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                  Portal do Servidor
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1">
                Abertura de Chamados para Suporte de TI & Manutenção
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSwitchToTechnician && (
              <button
                type="button"
                onClick={onSwitchToTechnician}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Acesso dos Técnicos de TI / Bancada de Chamados"
              >
                <Wrench className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Área do Técnico</span>
              </button>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-medium text-slate-300 text-[11px] sm:text-xs">Central de Chamados TI</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-6 sm:py-8 px-3.5 sm:px-6 w-full max-w-full overflow-x-hidden">
        <div className="max-w-3xl mx-auto space-y-6 min-w-0">

          {/* Quick Track by Protocol Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-emerald-400" /> Já abriu um chamado? Consulte o status pelo protocolo:
            </h3>
            <form onSubmit={handleSearchProtocol} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Ex: CH-2026-001"
                value={searchProtocol}
                onChange={(e) => setSearchProtocol(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shrink-0 flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4 text-emerald-400" />
                <span>Consultar Status</span>
              </button>
            </form>

            {searchedTicket && searchedTicket !== 'not_found' && (
              <div className="mt-4 p-4 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400 text-sm">{searchedTicket.code}</span>
                  {getStatusBadge(searchedTicket.status)}
                </div>
                <p className="text-white font-medium text-sm">{searchedTicket.title}</p>
                <div className="text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Secretaria: <strong className="text-slate-200">{searchedTicket.department}</strong></span>
                  <span>Serviço: <strong className="text-slate-200">{searchedTicket.equipmentType}</strong></span>
                  <span>Data: <strong className="text-slate-200">{new Date(searchedTicket.createdAt).toLocaleDateString('pt-BR')}</strong></span>
                </div>
                {(() => {
                  const dl = searchedTicket.deadline || calculateDefaultDeadline(searchedTicket.priority, new Date(searchedTicket.createdAt));
                  const sla = getSlaStatus(dl, searchedTicket.status);
                  return (
                    <div className="mt-2 p-2.5 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between text-xs gap-2 flex-wrap">
                      <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Previsão de Solução (SLA): <strong className="text-white font-bold font-mono">{formatSlaDate(dl)}</strong></span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] border ${sla.badgeClass}`}>
                        {sla.label}
                      </span>
                    </div>
                  );
                })()}
                {searchedTicket.notes && searchedTicket.notes.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80">
                    <p className="text-[11px] text-slate-400 font-semibold mb-1">Última atualização:</p>
                    <p className="text-[11px] text-slate-300 italic">"{searchedTicket.notes[searchedTicket.notes.length - 1].text}"</p>
                  </div>
                )}
              </div>
            )}

            {searchedTicket === 'not_found' && (
              <div className="mt-3 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
                Nenhum chamado encontrado com o código "{searchProtocol}". Verifique o número digitado.
              </div>
            )}
          </div>

          {/* Success screen after submission */}
          {successTicket ? (
            <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 text-center space-y-5 shadow-xl animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div>
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                  Chamado Registrado com Sucesso
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                  {successTicket.code}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-md mx-auto">
                  O administrador de TI da Prefeitura de Guaranésia foi notificado instantaneamente com alerta sonoro e visual na tela.
                </p>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-left max-w-md mx-auto space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Assunto:</span>
                  <span className="font-semibold text-white truncate max-w-[220px]">{successTicket.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Secretaria/Setor:</span>
                  <span className="font-semibold text-white">{successTicket.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tipo:</span>
                  <span className="font-semibold text-emerald-400">{successTicket.equipmentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status Inicial:</span>
                  <span className="font-semibold text-amber-400">Aberto (Aguardando Atendimento)</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/80 pt-2 text-cyan-300 font-medium">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Previsão de Solução (SLA):</span>
                  </span>
                  <span className="font-bold text-white font-mono">
                    {formatSlaDate(successTicket.deadline)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 flex-wrap">
                <a
                  href={`https://api.whatsapp.com/send?phone=5535991048020&text=${encodeURIComponent(
                    `*NOVO CHAMADO DE SUPORTE - PREFEITURA DE GUARANESIA*\n\n` +
                    `*Protocolo:* ${successTicket.code}\n` +
                    `*Solicitante:* ${successTicket.requesterName || 'Servidor'} (${successTicket.requesterContact || 'Não inf.'})\n` +
                    `*Secretaria/Setor:* ${successTicket.department}\n` +
                    `*Serviço:* ${successTicket.equipmentType}\n` +
                    `*Título:* ${successTicket.title}\n` +
                    `*Descrição:* ${successTicket.description}\n` +
                    `*Prioridade:* ${successTicket.priority}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-lg"
                >
                  <PhoneCall className="w-4 h-4 text-white" />
                  <span>Enviar para WhatsApp do Admin (35 99104-8020)</span>
                </a>

                <button
                  onClick={() => copyToClipboard(successTicket.code)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  {copiedProtocol ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  <span>{copiedProtocol ? 'Protocolo Copiado!' : 'Copiar Protocolo'}</span>
                </button>

                <button
                  onClick={() => setSuccessTicket(null)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold border border-slate-800 transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Abrir Outra Solicitação</span>
                </button>
              </div>
            </div>
          ) : (
            /* Submission Form Card */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-xl">
              <div className="border-b border-slate-800 pb-5 mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  Formulário de Abertura de Chamado
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Preencha os dados abaixo para solicitar manutenção em equipamentos ou publicação no site oficial.
                </p>
              </div>

              {errorMsg && (
                <div className="mb-6 p-3.5 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Identification of Requester */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" /> Seu Nome (ou apelido) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      list="saved-requesters-list"
                      placeholder="Ex: Carlos ou Maria (pode ser só o nome)"
                      value={requesterName}
                      onChange={(e) => handleRequesterNameChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                    <datalist id="saved-requesters-list">
                      {savedRequesters.map((sr, idx) => (
                        <option key={idx} value={sr.name} label={`WhatsApp: ${sr.whatsapp}`} />
                      ))}
                    </datalist>
                    {savedRequesters.length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-1">
                        💡 Digite seu nome para preencher o WhatsApp automaticamente.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: (35) 99876-5432"
                      value={requesterContact}
                      onChange={(e) => setRequesterContact(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Secretariat / Department */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Secretaria ou Setor Solicitante <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    {sortedDepartments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Service Type Selection Cards */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Qual equipamento ou serviço precisa de atendimento? <span className="text-rose-400">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {serviceCategories.map((cat) => {
                      const isSelected = equipmentType === cat.type;
                      return (
                        <button
                          key={cat.type}
                          type="button"
                          onClick={() => setEquipmentType(cat.type)}
                          className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                            isSelected 
                              ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-md ring-1 ring-emerald-500' 
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm">
                            {cat.icon}
                            <span>{cat.label}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 leading-tight">
                            {cat.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Resumo do Problema / Assunto <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Impressora apresentando luz de erro ou Solicitação de troca do toner preto"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Descrição Detalhada da Situação <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Descreva com detalhes o que está acontecendo, sala onde o equipamento está ou link/anexo que deve ser publicado..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                {/* Priority Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nível de Urgência
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(['Baixa', 'Média', 'Alta'] as Priority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`py-2 px-3 text-xs rounded-lg font-medium border transition-colors text-center ${
                          priority === p
                            ? 'bg-emerald-950 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {p === 'Baixa' && 'Normal (Padrão)'}
                        {p === 'Média' && 'Média (Importante)'}
                        {p === 'Alta' && 'Alta (Urgente)'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-6 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Enviando Chamado com Alerta Sonoro...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Chamado para a Equipe de TI</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-center text-slate-500 mt-2.5">
                    🔔 Ao clicar, a central de TI da prefeitura receberá um alerta na tela e um aviso sonoro imediato.
                  </p>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Public Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 px-6 text-center text-xs text-slate-500">
        Prefeitura Municipal de Guaranésia • Sistema de Atendimento e Suporte Técnico
      </footer>
    </div>
  );
}
