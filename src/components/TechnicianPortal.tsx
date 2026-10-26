/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Wrench, CheckCircle2, Clock, AlertTriangle, Search, Filter, 
  Phone, Mail, UserCheck, User, Plus, ArrowLeft, CheckSquare, 
  FileText, Send, Sparkles, RefreshCw, LogOut, ExternalLink, 
  Lock, Package, ShieldCheck, Check, Copy, X, Building2, 
  Printer, Monitor, Globe, Calendar, ChevronRight, ThumbsUp,
  Tag, PhoneCall, AlertCircle, ChevronDown, CheckCircle, Key
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  Ticket, Technician, TicketStatus, EquipmentType, Priority,
  formatSlaDate, getSlaStatus 
} from '../App';
import { isSupabaseReady } from '../lib/supabase';
import { playTicketAlertSound, initAudioContext } from '../lib/audioNotifier';

interface TechnicianPortalProps {
  technicians: Technician[];
  tickets: Ticket[];
  onUpdateTicket: (updatedTicket: Ticket) => void;
  onAddTechnician?: (tech: Technician) => void;
  onSwitchToAdmin: () => void;
  onSwitchToPortalServidor: () => void;
  onForceSync?: () => void;
  isSyncing?: boolean;
}

export default function TechnicianPortal({
  technicians,
  tickets,
  onUpdateTicket,
  onAddTechnician,
  onSwitchToAdmin,
  onSwitchToPortalServidor,
  onForceSync,
  isSyncing = false
}: TechnicianPortalProps) {
  // Filter for internal technicians, fallback to all if none are marked internal
  const internalTechnicians = technicians.filter(t => t.type === 'Interno');
  const availableTechs = internalTechnicians.length > 0 ? internalTechnicians : technicians;

  // Active technician ID stored in localStorage
  const [activeTechId, setActiveTechId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('guaranesia_active_tech_id');
      if (saved && technicians.some(t => t.id === saved)) {
        return saved;
      }
    }
    return null;
  });

  const activeTechnician = technicians.find(t => t.id === activeTechId) || null;

  // Login form state for Username & Password
  const [loginMode, setLoginMode] = useState<'select' | 'credentials'>('credentials');
  const [inputUsername, setInputUsername] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Save selected technician
  const handleSelectTechnician = (techId: string) => {
    setActiveTechId(techId);
    try {
      localStorage.setItem('guaranesia_active_tech_id', techId);
    } catch (e) {}
  };

  const handleCredentialsLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const cleanUser = inputUsername.trim().toLowerCase();
    const cleanPass = inputPassword.trim();

    if (!cleanUser || !cleanPass) {
      setLoginError('Informe o usuário e a senha cadastrados pela administração.');
      return;
    }

    // Find technician matching username and password
    const matched = technicians.find(t => {
      const u = (t.username || '').trim().toLowerCase();
      const p = (t.password || '').trim();
      // If admin didn't set a username yet, allow login if name matches or fallback
      const nameMatch = t.name.toLowerCase().includes(cleanUser);
      if (u) {
        return u === cleanUser && p === cleanPass;
      }
      return nameMatch && (p === cleanPass || !p);
    });

    if (matched) {
      handleSelectTechnician(matched.id);
    } else {
      setLoginError('Usuário ou senha incorretos. Verifique as credenciais fornecidas pelo administrador de TI.');
    }
  };

  const handleLogoutTechnician = () => {
    setActiveTechId(null);
    setInputUsername('');
    setInputPassword('');
    try {
      localStorage.removeItem('guaranesia_active_tech_id');
    } catch (e) {}
  };

  // State for registering a new internal technician if needed
  const [isNewTechModalOpen, setIsNewTechModalOpen] = useState(false);
  const [newTechName, setNewTechName] = useState('');
  const [newTechPhone, setNewTechPhone] = useState('');
  const [newTechEmail, setNewTechEmail] = useState('');
  const [newTechSpecialty, setNewTechSpecialty] = useState('');
  const [newTechUsername, setNewTechUsername] = useState('');
  const [newTechPassword, setNewTechPassword] = useState('');

  // Ticket tabs: 'meus' (assigned to me), 'disponiveis' (unassigned/team), 'concluidos' (my closed/resolved)
  const [tab, setTab] = useState<'meus' | 'disponiveis' | 'concluidos'>('meus');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected ticket for viewing details
  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);

  // Quick Action: Close / Conclude Ticket Modal
  const [concludeTicket, setConcludeTicket] = useState<Ticket | null>(null);
  const [concludeStatus, setConcludeStatus] = useState<'Resolvido' | 'Fechado'>('Resolvido');
  const [concludeResolutionNotes, setConcludeResolutionNotes] = useState('');
  const [concludeParts, setConcludeParts] = useState<string[]>([]);
  const [customPartInput, setCustomPartInput] = useState('');
  const [concludeCost, setConcludeCost] = useState<string>('');
  const [isSubmittingConclusion, setIsSubmittingConclusion] = useState(false);

  // New Note state inside details view
  const [noteText, setNoteText] = useState('');

  // Toast message
  const [actionToast, setActionToast] = useState<{ title: string; message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (title: string, message: string, type: 'success' | 'info' = 'success') => {
    setActionToast({ title, message, type });
    setTimeout(() => setActionToast(null), 4000);
  };

  // Keep viewing ticket synced when tickets list updates
  useEffect(() => {
    if (viewingTicket) {
      const updated = tickets.find(t => t.id === viewingTicket.id);
      if (updated) setViewingTicket(updated);
    }
  }, [tickets]);

  // Common quick solution presets for technicians
  const QUICK_SOLUTION_PRESETS = [
    'Troca de Toner realizada e testes de impressão executados com sucesso.',
    'Ponto de rede reparado, cabo RJ-45 re-crimpado e conectividade restabelecida.',
    'Equipamento reiniciado, drivers atualizados e sistema funcionando normalmente.',
    'Relógio de Ponto reiniciado, conexão com o servidor de folha restabelecida.',
    'Telefonia IP reconfigurada e ramal testado com êxito.',
    'Limpeza interna realizada, manutenção preventiva e testes de estabilidade.',
    'Site oficial da Prefeitura atualizado com as publicações solicitadas.'
  ];

  // Common spare parts chips
  const COMMON_PARTS = [
    'Toner Preto',
    'Toner Colorido',
    'Unidade de Imagem / Cilindro',
    'Cabo de Rede RJ-45',
    'Conector RJ-45',
    'Switch de Rede',
    'Filtro de Linha / DPS',
    'Fonte de Alimentação',
    'Teclado / Mouse USB'
  ];

  // Filtered tickets calculations
  const myTickets = tickets.filter(t => t.technicianId === activeTechId && !t.archived);
  const myOpenTickets = myTickets.filter(t => t.status === 'Aberto' || t.status === 'Em Andamento' || t.status === 'Aguardando Peças');
  const myCompletedTickets = myTickets.filter(t => t.status === 'Resolvido' || t.status === 'Fechado');
  const unassignedTickets = tickets.filter(t => (!t.technicianId || t.technicianId === '') && !t.archived && t.status !== 'Resolvido' && t.status !== 'Fechado');

  // Filtered list based on active tab
  const displayedTickets = React.useMemo(() => {
    let list: Ticket[] = [];
    if (tab === 'meus') {
      list = myOpenTickets;
    } else if (tab === 'concluidos') {
      list = myCompletedTickets;
    } else if (tab === 'disponiveis') {
      list = unassignedTickets;
    }

    return list.filter(t => {
      const matchesStatus = statusFilter === 'todos' || t.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        t.code.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.requesterName && t.requesterName.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [tab, myOpenTickets, myCompletedTickets, unassignedTickets, statusFilter, searchQuery]);

  // Handle fast status change (e.g. Start attendance)
  const handleSetTicketStatus = (ticket: Ticket, newStatus: TicketStatus) => {
    const now = new Date().toISOString();
    const techName = activeTechnician ? activeTechnician.name : 'Técnico';
    
    let noteMessage = `Status alterado para "${newStatus}" pelo técnico ${techName}.`;
    if (newStatus === 'Em Andamento') {
      noteMessage = `Atendimento iniciado pelo técnico ${techName}.`;
    } else if (newStatus === 'Aguardando Peças') {
      noteMessage = `Chamado pausado: aguardando peças/insumos necessários.`;
    }

    const updated: Ticket = {
      ...ticket,
      status: newStatus,
      updatedAt: now,
      technicianId: activeTechId || ticket.technicianId,
      notes: [
        ...ticket.notes,
        {
          id: `n-${Date.now()}`,
          author: `${techName} (Técnico Interno)`,
          text: noteMessage,
          timestamp: now
        }
      ]
    };

    onUpdateTicket(updated);
    showToast('Status Atualizado', `Chamado ${ticket.code} agora está "${newStatus}".`);
  };

  // Handle assigning unassigned ticket to current technician
  const handleClaimTicket = (ticket: Ticket) => {
    if (!activeTechId || !activeTechnician) return;
    const now = new Date().toISOString();

    const updated: Ticket = {
      ...ticket,
      technicianId: activeTechId,
      status: ticket.status === 'Aberto' ? 'Em Andamento' : ticket.status,
      updatedAt: now,
      notes: [
        ...ticket.notes,
        {
          id: `n-${Date.now()}`,
          author: `${activeTechnician.name} (Técnico Interno)`,
          text: `Chamado assumido pelo técnico ${activeTechnician.name}. Atendimento iniciado.`,
          timestamp: now
        }
      ]
    };

    onUpdateTicket(updated);
    showToast('Chamado Assumido!', `O chamado ${ticket.code} foi adicionado à sua lista.`);
    setTab('meus');
  };

  // Open Conclusion Modal
  const openConcludeModal = (ticket: Ticket) => {
    setConcludeTicket(ticket);
    setConcludeStatus('Resolvido');
    setConcludeResolutionNotes(ticket.resolutionNotes || '');
    setConcludeParts(ticket.partsUsed || []);
    setConcludeCost(ticket.cost ? String(ticket.cost) : '');
  };

  // Execute Direct Conclusion / Closing
  const handleExecuteConcludeTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concludeTicket) return;

    const finalNotes = concludeResolutionNotes.trim();
    if (!finalNotes) {
      alert('Por favor, informe um breve parecer técnico ou solução aplicada antes de encerrar o chamado.');
      return;
    }

    setIsSubmittingConclusion(true);
    const now = new Date().toISOString();
    const techName = activeTechnician ? activeTechnician.name : 'Técnico Interno';

    const costNum = concludeCost ? parseFloat(concludeCost.replace(',', '.')) : concludeTicket.cost;

    const updated: Ticket = {
      ...concludeTicket,
      status: concludeStatus,
      updatedAt: now,
      resolutionNotes: finalNotes,
      partsUsed: concludeParts,
      cost: isNaN(costNum as number) ? undefined : (costNum as number),
      notes: [
        ...concludeTicket.notes,
        {
          id: `n-${Date.now()}`,
          author: `${techName} (Técnico Interno)`,
          text: `CHAMADO ENCERRADO (${concludeStatus}): ${finalNotes}`,
          timestamp: now
        }
      ]
    };

    onUpdateTicket(updated);
    setIsSubmittingConclusion(false);
    setConcludeTicket(null);

    // Confetti celebration!
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {}

    playTicketAlertSound();
    showToast('🎉 Chamado Encerrado!', `O chamado ${concludeTicket.code} foi concluído e encerrado com sucesso.`);
  };

  // Add intermediate note
  const handleAddQuickNote = (ticket: Ticket) => {
    if (!noteText.trim()) return;
    const now = new Date().toISOString();
    const techName = activeTechnician ? activeTechnician.name : 'Técnico Interno';

    const updated: Ticket = {
      ...ticket,
      updatedAt: now,
      notes: [
        ...ticket.notes,
        {
          id: `n-${Date.now()}`,
          author: `${techName} (Técnico Interno)`,
          text: noteText.trim(),
          timestamp: now
        }
      ]
    };

    onUpdateTicket(updated);
    setNoteText('');
    showToast('Apontamento Registrado', 'Sua nota técnica foi registrada com sucesso.');
  };

  // Add custom internal technician
  const handleCreateTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechName.trim()) return;

    const newTech: Technician = {
      id: `tech-${Date.now()}`,
      name: newTechName.trim(),
      type: 'Interno',
      phone: newTechPhone.trim(),
      email: newTechEmail.trim(),
      specialty: newTechSpecialty.trim() || 'Suporte de TI Geral',
      username: newTechUsername.trim() || undefined,
      password: newTechPassword.trim() || undefined
    };

    if (onAddTechnician) {
      onAddTechnician(newTech);
    }
    handleSelectTechnician(newTech.id);
    setIsNewTechModalOpen(false);
    setNewTechName('');
    setNewTechPhone('');
    setNewTechEmail('');
    setNewTechSpecialty('');
    setNewTechUsername('');
    setNewTechPassword('');
    showToast('Técnico Cadastrado!', `Bem-vindo(a), ${newTech.name}.`);
  };

  const getEquipmentIcon = (type: EquipmentType) => {
    switch (type) {
      case 'Impressora':
      case 'Troca de Toner': return <Printer className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'Relógio de Ponto': return <Clock className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'Telefone IP': return <Phone className="w-4 h-4 text-indigo-400 shrink-0" />;
      case 'Computador': return <Monitor className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'Atualização do Site': return <Globe className="w-4 h-4 text-cyan-400 shrink-0" />;
      default: return <Wrench className="w-4 h-4 text-amber-400 shrink-0" />;
    }
  };

  // ==========================================
  // VIEW 1: TECHNICIAN LOGIN / SELECTOR
  // ==========================================
  if (!activeTechnician) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white font-extrabold text-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/50">
              <Wrench className="w-8 h-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-2">
              Painel do Técnico Interno
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Prefeitura Municipal de Guaranésia • Central de Atendimento TI
            </p>
          </div>

          {/* Login Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setLoginMode('credentials')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMode === 'credentials'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Usuário e Senha</span>
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('select')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMode === 'select'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Selecionar Nome</span>
            </button>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-xl text-xs flex items-start gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Credentials Login Form */}
          {loginMode === 'credentials' ? (
            <form onSubmit={handleCredentialsLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Usuário de Acesso
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: carlos ou carlos.ti"
                  value={inputUsername}
                  onChange={(e) => setInputUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Senha do Técnico
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Entrar na Minha Bancada</span>
              </button>
            </form>
          ) : (
            /* List of internal technicians for quick selection */
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Clique no seu nome para acessar diretamente:</span>
              </div>

              {availableTechs.map(tech => {
                const myCount = tickets.filter(t => t.technicianId === tech.id && (t.status === 'Aberto' || t.status === 'Em Andamento' || t.status === 'Aguardando Peças')).length;
                return (
                  <button
                    key={tech.id}
                    onClick={() => handleSelectTechnician(tech.id)}
                    className="w-full p-3.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/60 rounded-2xl transition-all flex items-center justify-between text-left group cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                        {tech.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs truncate group-hover:text-emerald-300 transition-colors">
                            {tech.name}
                          </span>
                          {tech.username && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1 rounded">
                              @{tech.username}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {tech.specialty || 'Técnico de Suporte'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {myCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {myCount} aberto{myCount > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          Livre
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400" />
                    </div>
                  </button>
                );
              })}

              {availableTechs.length === 0 && (
                <div className="text-center py-6 text-slate-500 text-xs">
                  Nenhum técnico cadastrado ainda. Cadastre o primeiro técnico abaixo!
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-slate-800">
            <button
              onClick={() => setIsNewTechModalOpen(true)}
              className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cadastrar Novo Técnico</span>
            </button>
            <button
              onClick={onSwitchToAdmin}
              className="py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Painel Admin</span>
            </button>
          </div>
        </div>

        {/* Modal: New Technician Registration */}
        {isNewTechModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-sm sm:text-base">Cadastrar Técnico Interno</h3>
                </div>
                <button 
                  onClick={() => setIsNewTechModalOpen(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateTechnician} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Alberto da Silva"
                    value={newTechName}
                    onChange={(e) => setNewTechName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Usuário de Acesso *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: carlos.ti"
                      value={newTechUsername}
                      onChange={(e) => setNewTechUsername(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Senha de Acesso *</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={newTechPassword}
                      onChange={(e) => setNewTechPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Especialidade / Foco Principal</label>
                  <input
                    type="text"
                    placeholder="Ex: Redes, Impressoras e Computadores"
                    value={newTechSpecialty}
                    onChange={(e) => setNewTechSpecialty(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="(35) 99999-9999"
                      value={newTechPhone}
                      onChange={(e) => setNewTechPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
                    <input
                      type="email"
                      placeholder="ti@guaranesia.mg.gov.br"
                      value={newTechEmail}
                      onChange={(e) => setNewTechEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNewTechModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Salvar e Acessar Painel</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-slate-600">
          Prefeitura Municipal de Guaranésia • Sistema de Atendimento e TI
        </footer>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: DEDICATED TECHNICIAN CONTROL WORKSPACE
  // ==========================================
  return (
    <div 
      onClick={() => initAudioContext()}
      className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans max-w-[100vw] overflow-x-hidden relative"
    >
      {/* Toast alert */}
      {actionToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-slate-950 border-2 border-emerald-500/80 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-6 duration-300 ring-4 ring-emerald-500/20">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
              {actionToast.title}
            </span>
            <p className="text-xs sm:text-sm text-slate-200 mt-0.5">{actionToast.message}</p>
          </div>
          <button
            onClick={() => setActionToast(null)}
            className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800 px-3 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md no-print">
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold text-white truncate">
                  {activeTechnician.name}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Técnico Interno
                </span>
                {activeTechnician.username && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                    @{activeTechnician.username}
                  </span>
                )}
                {isSupabaseReady() && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Nuvem Online
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {activeTechnician.specialty || 'TI Prefeitura de Guaranésia'}
                {activeTechnician.phone ? ` • ${activeTechnician.phone}` : ''}
              </p>
            </div>
          </div>

          {/* Quick logout for mobile */}
          <div className="sm:hidden flex items-center gap-1.5">
            <button
              onClick={handleLogoutTechnician}
              className="p-1.5 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-xs"
              title="Sair / Trocar Técnico"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
          {onForceSync && (
            <button
              onClick={onForceSync}
              disabled={isSyncing}
              className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Sincronizar dados com o banco"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          )}

          <button
            onClick={onSwitchToPortalServidor}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Abrir formulário de chamado do servidor"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Portal do Servidor</span>
          </button>

          <button
            onClick={onSwitchToAdmin}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Acessar Painel Administrativo Geral"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Painel Admin</span>
          </button>

          <button
            onClick={handleLogoutTechnician}
            className="hidden sm:flex px-2.5 py-1.5 bg-slate-900 border border-slate-800 hover:border-rose-900/50 hover:text-rose-400 text-slate-300 rounded-lg text-xs font-medium items-center gap-1.5 transition-colors"
            title="Sair da minha bancada e selecionar outro técnico"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair / Trocar</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium">Meus em Aberto</p>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                {myOpenTickets.length}
              </h3>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium">Em Andamento</p>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                {myTickets.filter(t => t.status === 'Em Andamento').length}
              </h3>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium">Meus Encerrados</p>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                {myCompletedTickets.length}
              </h3>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium">Mural Sem Técnico</p>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                {unassignedTickets.length}
              </h3>
            </div>
          </div>
        </div>

        {/* Tab & Filter Bar */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Main Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto">
              <button
                onClick={() => setTab('meus')}
                className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  tab === 'meus' 
                    ? 'bg-emerald-500 text-slate-950 shadow-md' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Meus Chamados Ativos ({myOpenTickets.length})</span>
              </button>

              <button
                onClick={() => setTab('disponiveis')}
                className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  tab === 'disponiveis' 
                    ? 'bg-emerald-500 text-slate-950 shadow-md' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Mural Equipe ({unassignedTickets.length})</span>
              </button>

              <button
                onClick={() => setTab('concluidos')}
                className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  tab === 'concluidos' 
                    ? 'bg-emerald-500 text-slate-950 shadow-md' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Meus Encerrados ({myCompletedTickets.length})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar código, secretaria, assunto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tickets List */}
        {displayedTickets.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 text-slate-500 flex items-center justify-center mx-auto border border-slate-800">
              <CheckCircle2 className="w-7 h-7 text-emerald-400/80" />
            </div>
            <h3 className="font-bold text-white text-sm sm:text-base">
              {tab === 'meus' 
                ? 'Nenhum chamado pendente atribuído a você no momento!' 
                : tab === 'disponiveis' 
                ? 'Não há chamados aguardando atribuição no mural.' 
                : 'Nenhum chamado encerrado encontrado com estes filtros.'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {tab === 'meus' 
                ? 'Você está em dia com seus atendimentos! Que tal conferir a aba "Mural Equipe" para assumir novas demandas?' 
                : 'Quando novos chamados forem abertos pelos servidores municipais, eles aparecerão aqui automaticamente.'}
            </p>
            {tab === 'meus' && unassignedTickets.length > 0 && (
              <button
                onClick={() => setTab('disponiveis')}
                className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl shadow inline-flex items-center gap-1.5"
              >
                <span>Ver {unassignedTickets.length} chamado(s) disponíveis no Mural</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {displayedTickets.map(ticket => {
              const sla = getSlaStatus(ticket.deadline, ticket.status);
              const isAssignedToMe = ticket.technicianId === activeTechId;
              const isFinished = ticket.status === 'Resolvido' || ticket.status === 'Fechado';

              return (
                <div
                  key={ticket.id}
                  className={`bg-slate-950 border rounded-2xl p-4 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between gap-3 relative ${
                    ticket.priority === 'Crítica' && !isFinished 
                      ? 'border-rose-900/60 ring-1 ring-rose-500/20' 
                      : 'border-slate-800'
                  }`}
                >
                  {/* Top Ticket Header */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                          {ticket.code}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold truncate max-w-[180px] sm:max-w-[220px]">
                          {getEquipmentIcon(ticket.equipmentType)}
                          <span className="truncate">{ticket.equipmentType}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                          ticket.status === 'Aberto' ? 'bg-amber-950/80 text-amber-300 border-amber-700/60' :
                          ticket.status === 'Em Andamento' ? 'bg-blue-950/80 text-blue-300 border-blue-700/60' :
                          ticket.status === 'Aguardando Peças' ? 'bg-purple-950/80 text-purple-300 border-purple-700/60' :
                          ticket.status === 'Resolvido' ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' :
                          'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {ticket.status}
                        </span>

                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${sla.badgeClass}`}>
                          {sla.label}
                        </span>
                      </div>
                    </div>

                    {/* Department & Title */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-medium text-slate-300 truncate">{ticket.department}</span>
                      </div>
                      <h4 className="font-bold text-white text-sm line-clamp-2">
                        {ticket.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {ticket.description}
                      </p>
                    </div>

                    {/* Requester Info */}
                    {ticket.requesterName && (
                      <div className="p-2 bg-slate-900/80 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-300 truncate">
                            Solicitante: <strong className="text-white">{ticket.requesterName}</strong>
                          </span>
                        </div>
                        {ticket.requesterContact && (
                          <a
                            href={`https://wa.me/55${ticket.requesterContact.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 shrink-0"
                            title="Conversar no WhatsApp"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>{ticket.requesterContact}</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Resolution snippet if closed */}
                    {isFinished && ticket.resolutionNotes && (
                      <div className="p-2.5 bg-emerald-950/40 rounded-xl border border-emerald-800/50 text-xs text-emerald-200">
                        <div className="flex items-center gap-1 font-bold text-emerald-400 mb-0.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Solução / Parecer Técnico Aplicado:</span>
                        </div>
                        <p className="italic">{ticket.resolutionNotes}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons Section */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 flex-wrap">
                    {/* If ticket is not assigned to current technician (Mural) */}
                    {!isAssignedToMe && !isFinished && (
                      <button
                        onClick={() => handleClaimTicket(ticket)}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Assumir Este Chamado</span>
                      </button>
                    )}

                    {/* If ticket is assigned to current technician */}
                    {isAssignedToMe && !isFinished && (
                      <>
                        {/* THE HIGHLIGHT ACTION: ENCERRAR CHAMADO / DAR COMO ENCERRADA */}
                        <button
                          onClick={() => openConcludeModal(ticket)}
                          className="flex-1 py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 ring-2 ring-emerald-500/20 active:scale-95"
                          title="Dar como Encerrada e registrar solução técnica"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Encerrar Chamado</span>
                        </button>

                        {/* Quick state transitions */}
                        {ticket.status === 'Aberto' && (
                          <button
                            onClick={() => handleSetTicketStatus(ticket, 'Em Andamento')}
                            className="py-2.5 px-3 bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1"
                            title="Colocar em andamento"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Iniciar</span>
                          </button>
                        )}

                        {ticket.status === 'Em Andamento' && (
                          <button
                            onClick={() => handleSetTicketStatus(ticket, 'Aguardando Peças')}
                            className="py-2.5 px-3 bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 border border-purple-500/40 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1"
                            title="Aguardar peças ou peças em trânsito"
                          >
                            <Package className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Aguardar Peças</span>
                          </button>
                        )}
                      </>
                    )}

                    {/* Details / History Modal */}
                    <button
                      onClick={() => setViewingTicket(ticket)}
                      className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs rounded-xl border border-slate-800 transition-colors flex items-center justify-center gap-1"
                      title="Ver detalhes completos e histórico"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Detalhes ({ticket.notes?.length || 0})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ========================================================
          MODAL: ENCERRAR CHAMADO / DAR COMO ENCERRADA
          ======================================================== */}
      {concludeTicket && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Encerramento Técnico
                  </span>
                  <h3 className="font-bold text-white text-base sm:text-lg">
                    Encerrar Chamado [{concludeTicket.code}]
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setConcludeTicket(null)}
                className="text-slate-400 hover:text-white p-1 text-sm rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Ticket Info Card */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1 text-slate-300">
              <div>
                <strong className="text-white">{concludeTicket.title}</strong>
              </div>
              <div className="text-slate-400 flex items-center gap-2 flex-wrap">
                <span>Setor: <strong className="text-slate-200">{concludeTicket.department}</strong></span>
                <span>•</span>
                <span>Tipo: <strong className="text-emerald-400">{concludeTicket.equipmentType}</strong></span>
                {concludeTicket.requesterName && (
                  <>
                    <span>•</span>
                    <span>Solicitante: <strong className="text-slate-200">{concludeTicket.requesterName}</strong></span>
                  </>
                )}
              </div>
            </div>

            {/* Conclusion Form */}
            <form onSubmit={handleExecuteConcludeTicket} className="space-y-4">
              {/* Closing Status Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Status Final de Encerramento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConcludeStatus('Resolvido')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      concludeStatus === 'Resolvido'
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/20'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Resolvido (Sucesso)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConcludeStatus('Fechado')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      concludeStatus === 'Fechado'
                        ? 'bg-slate-800 border-slate-600 text-white ring-2 ring-slate-500/20'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4 text-slate-300" />
                    <span>Fechado (Concluído)</span>
                  </button>
                </div>
              </div>

              {/* Technical Resolution Notes / Parecer Técnico */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Parecer Técnico / Solução Aplicada *
                  </label>
                  <span className="text-[10px] text-slate-400">Obrigatório</span>
                </div>
                
                {/* 1-Tap Quick Presets */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 w-full mb-0.5">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Atalhos rápidos para mobile:
                  </span>
                  {QUICK_SOLUTION_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setConcludeResolutionNotes(preset)}
                      className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-800 transition-colors text-left"
                    >
                      {preset.slice(0, 38)}...
                    </button>
                  ))}
                </div>

                <textarea
                  required
                  rows={3}
                  placeholder="Descreva o serviço executado (ex: Toner trocado, limpeza interna do fusor e teste de impressão aprovado pelo servidor)..."
                  value={concludeResolutionNotes}
                  onChange={(e) => setConcludeResolutionNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Parts & Equipment Used (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Peças / Insumos Utilizados (Opcional)</span>
                </label>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_PARTS.map((p, idx) => {
                    const isSelected = concludeParts.includes(p);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setConcludeParts(prev => prev.filter(item => item !== p));
                          } else {
                            setConcludeParts(prev => [...prev, p]);
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                          isSelected 
                            ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold' 
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '} {p}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Part Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Outro item ou número de série da peça..."
                    value={customPartInput}
                    onChange={(e) => setCustomPartInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customPartInput.trim()) {
                          setConcludeParts(prev => [...prev, customPartInput.trim()]);
                          setCustomPartInput('');
                        }
                      }
                    }}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customPartInput.trim()) {
                        setConcludeParts(prev => [...prev, customPartInput.trim()]);
                        setCustomPartInput('');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
                  >
                    Adicionar
                  </button>
                </div>

                {concludeParts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {concludeParts.map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-slate-800 text-emerald-300 px-2 py-0.5 rounded-md border border-slate-700">
                        {item}
                        <button
                          type="button"
                          onClick={() => setConcludeParts(prev => prev.filter((_, idx) => idx !== i))}
                          className="hover:text-rose-400 ml-1"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Maintenance Cost (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Custo Estimado das Peças / Insumos (R$) - Opcional
                </label>
                <input
                  type="text"
                  placeholder="0,00"
                  value={concludeCost}
                  onChange={(e) => setConcludeCost(e.target.value)}
                  className="w-full sm:w-48 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {/* Confirm / Submit Button */}
              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConcludeTicket(null)}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingConclusion}
                  className="py-3 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ring-2 ring-emerald-500/20"
                >
                  {isSubmittingConclusion ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Confirmar Encerramento do Chamado</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: TICKET DETAILS & APONTAMENTOS (NOTES)
          ======================================================== */}
      {viewingTicket && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    {viewingTicket.code}
                  </span>
                  <span className="text-xs font-bold text-white">{viewingTicket.equipmentType}</span>
                </div>
                <h3 className="font-bold text-white text-base sm:text-lg mt-1">
                  {viewingTicket.title}
                </h3>
              </div>
              <button 
                onClick={() => setViewingTicket(null)}
                className="text-slate-400 hover:text-white p-1 text-sm rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Secretaria / Setor:</span>
                <span className="font-bold text-white truncate block">{viewingTicket.department}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Status Atual:</span>
                <span className="font-bold text-emerald-400 block">{viewingTicket.status}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Prazo SLA:</span>
                <span className="font-bold text-white block">{formatSlaDate(viewingTicket.deadline)}</span>
              </div>
              {viewingTicket.requesterName && (
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-3 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Solicitante:</span>
                    <span className="font-bold text-white">{viewingTicket.requesterName}</span>
                  </div>
                  {viewingTicket.requesterContact && (
                    <a
                      href={`https://wa.me/55${viewingTicket.requesterContact.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>{viewingTicket.requesterContact}</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-xs font-semibold block mb-1">Descrição do Problema:</span>
              <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {viewingTicket.description}
              </p>
            </div>

            {/* AI Diagnosis if present */}
            {viewingTicket.aiDiagnosis && (
              <div className="bg-emerald-950/30 p-3 rounded-xl border border-emerald-800/40 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Diagnóstico Inteligente Sugerido:</span>
                </div>
                <p className="text-slate-200">{viewingTicket.aiDiagnosis.diagnostico}</p>
                {viewingTicket.aiDiagnosis.passosResolucao && viewingTicket.aiDiagnosis.passosResolucao.length > 0 && (
                  <ul className="list-disc list-inside text-slate-300 space-y-0.5 pt-1">
                    {viewingTicket.aiDiagnosis.passosResolucao.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* History Notes */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Histórico de Apontamentos ({viewingTicket.notes?.length || 0})</span>
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {viewingTicket.notes?.map(n => (
                  <div key={n.id} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <strong className="text-emerald-400">{n.author}</strong>
                      <span>{new Date(n.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                    <p className="text-slate-200">{n.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Add note form */}
            {viewingTicket.status !== 'Resolvido' && viewingTicket.status !== 'Fechado' && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Adicionar Apontamento Técnico
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Escreva um apontamento sobre o andamento..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddQuickNote(viewingTicket);
                      }
                    }}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddQuickNote(viewingTicket)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gravar</span>
                  </button>
                </div>
              </div>
            )}

            {/* Bottom actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setViewingTicket(null)}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Fechar Detalhes
              </button>

              {viewingTicket.technicianId === activeTechId && viewingTicket.status !== 'Resolvido' && viewingTicket.status !== 'Fechado' && (
                <button
                  type="button"
                  onClick={() => {
                    const ticketToConclude = viewingTicket;
                    setViewingTicket(null);
                    openConcludeModal(ticketToConclude);
                  }}
                  className="py-2 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Dar como Encerrada</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-3 px-6 text-center text-xs text-slate-500 no-print mt-auto">
        Prefeitura Municipal de Guaranésia • Painel do Técnico Interno • Central de Atendimento TI
      </footer>
    </div>
  );
}
