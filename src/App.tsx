/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Wrench, Printer, Clock, Phone, Monitor, Plus, Search, Filter, 
  CheckCircle2, AlertTriangle, Clock3, UserCheck, Building2, 
  FileText, Sparkles, PhoneCall, Trash2, Edit3, Eye, ArrowRight,
  ShieldCheck, BarChart3, Users, HardDrive, Share2, Printer as PrinterIcon,
  CheckSquare, XCircle, AlertCircle, HelpCircle, RefreshCw, Send, Lock, Printer as Print, Database,
  Globe, Volume2, VolumeX, Bell, BellRing, Link2, ExternalLink, Copy, Check, LogOut,
  FileSpreadsheet, Package, Tag, Cpu, Wifi, Network, Cable, X, Cloud
} from 'lucide-react';
import { supabase, isSupabaseReady, fetchAndApplyServerCredentials } from './lib/supabase';
import { 
  syncWithSupabase, 
  saveTicketToSupabase, 
  deleteTicketFromSupabase, 
  saveDepartmentToSupabase, 
  deleteDepartmentFromSupabase,
  deleteTechnicianFromSupabase
} from './lib/cloudDbService';
import confetti from 'canvas-confetti';
import PortalServidor from './components/PortalServidor';
import AdminLogin from './components/AdminLogin';
import DashboardCharts from './components/DashboardCharts';
import BackupModal from './components/BackupModal';
import CloudSyncModal from './components/CloudSyncModal';
import TechnicianPortal from './components/TechnicianPortal';
import { checkAndRunDailyScheduledBackup } from './lib/backupService';
import { initAudioContext, playTicketAlertSound, getSoundEnabled, setSoundEnabled } from './lib/audioNotifier';

// Types
export type EquipmentType = 'Impressora' | 'Troca de Toner' | 'Relógio de Ponto' | 'Telefone IP' | 'Computador' | 'Atualização do Site' | 'Outros';
export type TicketStatus = 'Aberto' | 'Em Andamento' | 'Aguardando Peças' | 'Resolvido' | 'Fechado' | 'Cancelado';
export type Priority = 'Baixa' | 'Média' | 'Alta' | 'Crítica';

export interface Technician {
  id: string;
  name: string;
  type: 'Interno' | 'Terceirizado';
  company?: string;
  phone: string;
  email: string;
  specialty: string;
  username?: string;
  password?: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  model: string;
  serialNumber: string;
  department: string;
  ipAddress?: string;
  status: 'Operacional' | 'Manutenção' | 'Inativo';
}

export interface TicketNote {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

export interface Ticket {
  id: string;
  code: string;
  equipmentId?: string;
  equipmentType: EquipmentType;
  department: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  technicianId?: string;
  createdAt: string;
  updatedAt: string;
  resolutionNotes?: string;
  partsUsed?: string[];
  cost?: number;
  deadline?: string; // Prazo de entrega
  notes: TicketNote[];
  requesterName?: string;
  requesterContact?: string;
  aiDiagnosis?: {
    diagnostico: string;
    passosResolucao: string[];
    pecasSugeridas: string[];
    tempoEstimado: string;
  };
  archived?: boolean;
}

export const sortDepartments = (list: string[]): string[] =>
  [...list].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

export const DEFAULT_DEPARTMENTS = sortDepartments([
  'Departamento de Recursos Humanos',
  'Gabinete do Prefeito',
  'Sala do Cidadão / TI',
  'Secretaria de Administração',
  'Secretaria de Agricultura e Meio Ambiente',
  'Secretaria de Assistência Social',
  'Secretaria de Educação',
  'Secretaria de Finanças',
  'Secretaria de Obras e Serviços',
  'Secretaria de Saúde'
]);

export const DEFAULT_TECHNICIANS: Technician[] = [
  {
    id: 'tech-1',
    name: 'Carlos Roberto (TI Interno)',
    type: 'Interno',
    phone: '(35) 99876-1234',
    email: 'carlos.ti@guaranesia.mg.gov.br',
    specialty: 'Redes, Telefonia IP e Relógio de Ponto',
    username: 'carlos',
    password: '123456'
  },
  {
    id: 'tech-2',
    name: 'Marcos Vinícius (TI Interno)',
    type: 'Interno',
    phone: '(35) 99123-5678',
    email: 'marcos.ti@guaranesia.mg.gov.br',
    specialty: 'Impressoras, Manutenção e Troca de Toner',
    username: 'marcos',
    password: '123456'
  },
  {
    id: 'tech-3',
    name: 'Ana Paula (Suporte de TI)',
    type: 'Interno',
    phone: '(35) 98845-6789',
    email: 'suporte@guaranesia.mg.gov.br',
    specialty: 'Sistemas, Atualização do Site e Suporte Geral',
    username: 'ana',
    password: '123456'
  }
];

export const calculateDefaultDeadline = (priority: Priority, fromDate: Date = new Date()): string => {
  const date = new Date(fromDate);
  switch (priority) {
    case 'Crítica':
      date.setHours(date.getHours() + 24);
      break;
    case 'Alta':
      date.setHours(date.getHours() + 24);
      break;
    case 'Média':
      date.setHours(date.getHours() + 48);
      break;
    case 'Baixa':
      date.setHours(date.getHours() + 72);
      break;
  }
  return date.toISOString();
};

export const generateUniqueTicketCode = (existingTickets: Ticket[]): string => {
  const currentYear = new Date().getFullYear();
  let seq = existingTickets.length + 1;
  existingTickets.forEach(t => {
    if (t && t.code) {
      const parts = t.code.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num >= seq) {
        seq = num + 1;
      }
    }
  });

  let code = `CH-${currentYear}-${String(seq).padStart(3, '0')}`;
  while (existingTickets.some(t => t.code === code)) {
    seq++;
    code = `CH-${currentYear}-${String(seq).padStart(3, '0')}`;
  }
  return code;
};

export const normalizeTicketCodes = (tickets: Ticket[]): Ticket[] => {
  const currentYear = new Date().getFullYear();
  const seenCodes = new Set<string>();
  let nextSeq = 1;

  return tickets.map((t, idx) => {
    if (!t || !t.code) {
      const code = `CH-${currentYear}-${String(idx + 1).padStart(3, '0')}`;
      seenCodes.add(code);
      return { ...t, code };
    }

    if (seenCodes.has(t.code)) {
      while (seenCodes.has(`CH-${currentYear}-${String(nextSeq).padStart(3, '0')}`)) {
        nextSeq++;
      }
      const uniqueCode = `CH-${currentYear}-${String(nextSeq).padStart(3, '0')}`;
      seenCodes.add(uniqueCode);
      nextSeq++;
      return { ...t, code: uniqueCode };
    } else {
      seenCodes.add(t.code);
      const match = t.code.match(/CH-\d+-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num >= nextSeq) nextSeq = num + 1;
      }
      return t;
    }
  });
};

export const formatSlaDate = (deadlineStr?: string): string => {
  if (!deadlineStr) return 'Não informada';
  try {
    const d = new Date(deadlineStr);
    if (isNaN(d.getTime())) return deadlineStr;
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return deadlineStr;
  }
};

export const getSlaStatus = (deadlineStr?: string, status?: TicketStatus) => {
  if (status === 'Resolvido' || status === 'Fechado' || status === 'Cancelado') {
    return {
      type: 'completed',
      label: 'Concluído',
      badgeClass: 'bg-slate-800/80 text-slate-300 border-slate-700'
    };
  }
  if (!deadlineStr) {
    return {
      type: 'none',
      label: 'Prazo a definir',
      badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700'
    };
  }

  const deadlineMs = new Date(deadlineStr).getTime();
  if (isNaN(deadlineMs)) {
    return {
      type: 'none',
      label: 'Prazo a definir',
      badgeClass: 'bg-slate-800/80 text-slate-400 border-slate-700'
    };
  }

  const now = Date.now();
  const diffHours = (deadlineMs - now) / (1000 * 60 * 60);

  if (diffHours < 0) {
    const hoursLate = Math.abs(Math.floor(diffHours));
    return {
      type: 'overdue',
      label: `Vencido (-${hoursLate}h)`,
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold animate-pulse'
    };
  } else if (diffHours <= 24) {
    const hoursLeft = Math.max(1, Math.ceil(diffHours));
    return {
      type: 'warning',
      label: `Vence em ${hoursLeft}h`,
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
    };
  } else {
    return {
      type: 'ok',
      label: 'No Prazo',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-medium'
    };
  }
};

export const isoToDatetimeLocal = (isoStr?: string): string => {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return '';
  }
};

export function getDeletedTechIds(): string[] {
  try {
    const s = localStorage.getItem('guaranesia_deleted_tech_ids');
    return s ? JSON.parse(s) : [];
  } catch (e) {
    return [];
  }
}

export function getDeletedDepartments(): string[] {
  try {
    const s = localStorage.getItem('guaranesia_deleted_departments');
    return s ? JSON.parse(s) : [];
  } catch (e) {
    return [];
  }
}

export function getDeletedTicketIds(): string[] {
  try {
    const s = localStorage.getItem('guaranesia_deleted_ticket_ids');
    return s ? JSON.parse(s) : [];
  } catch (e) {
    return [];
  }
}

export function scanAndRecoverAllLocalStorage(): {
  tickets: Ticket[];
  departments: string[];
  equipment: Equipment[];
  technicians: Technician[];
} {
  const recoveredTickets: Ticket[] = [];
  const recoveredDepts = new Set<string>();
  const recoveredEq: Equipment[] = [];
  const recoveredTechs: Technician[] = [];

  if (typeof window === 'undefined' || !window.localStorage) {
    return { tickets: [], departments: [], equipment: [], technicians: [] };
  }

  const deletedTechIds = getDeletedTechIds();
  const deletedDepts = getDeletedDepartments();
  const deletedTicketIds = getDeletedTicketIds();

  try {
    const tVal = localStorage.getItem('guaranesia_prod_tickets');
    if (tVal) {
      const parsed = JSON.parse(tVal);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          if (item && item.id && !deletedTicketIds.includes(item.id)) {
            recoveredTickets.push(item);
          }
        });
      }
    }

    const dVal = localStorage.getItem('guaranesia_prod_departments');
    if (dVal) {
      const parsed = JSON.parse(dVal);
      if (Array.isArray(parsed)) {
        parsed.forEach((d: string) => {
          if (d && typeof d === 'string' && !deletedDepts.some(dd => dd.toLowerCase() === d.toLowerCase())) {
            recoveredDepts.add(d);
          }
        });
      }
    }

    const eqVal = localStorage.getItem('guaranesia_prod_equipment');
    if (eqVal) {
      const parsed = JSON.parse(eqVal);
      if (Array.isArray(parsed)) {
        parsed.forEach((eq: any) => {
          if (eq && eq.id) recoveredEq.push(eq);
        });
      }
    }

    const techVal = localStorage.getItem('guaranesia_prod_technicians');
    if (techVal) {
      const parsed = JSON.parse(techVal);
      if (Array.isArray(parsed)) {
        parsed.forEach((tech: any) => {
          if (tech && tech.id && !deletedTechIds.includes(tech.id)) {
            recoveredTechs.push(tech);
          }
        });
      }
    }
  } catch (e) {}

  return {
    tickets: recoveredTickets,
    departments: Array.from(recoveredDepts),
    equipment: recoveredEq,
    technicians: recoveredTechs
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tickets' | 'equipment' | 'technicians' | 'departments'>('dashboard');
  
  // View mode: 'admin' (restricted control), 'portal' (public submission), or 'technician' (individual tech workbench)
  const [viewMode, setViewMode] = useState<'admin' | 'portal' | 'technician'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('portal') === 'servidor' || params.get('abrir') === '1') {
        return 'portal';
      }
      if (params.get('portal') === 'tecnico' || params.get('tecnico') === '1' || params.get('area') === 'tecnico') {
        return 'technician';
      }
    }
    return 'admin';
  });

  // Track if current portal view is an administrator preview (so public users never see admin button)
  const [isAdminPreview, setIsAdminPreview] = useState(false);

  // Administrator authentication state (digitalpersonal@gmail.com)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('guaranesia_admin_auth') === 'true';
    }
    return false;
  });

  // Sound and Live Alert states
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => getSoundEnabled());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const res = await Notification.requestPermission();
      setNotifPermission(res);
      if (res === 'granted') {
        new Notification('Notificações Nativas Ativadas!', {
          body: 'O administrador receberá alertas do sistema quando novos chamados chegarem, mesmo em segundo plano.',
          icon: '/favicon.ico'
        });
      } else {
        alert('Permissão de notificação negada pelo navegador.');
      }
    } else {
      alert('Seu navegador não suporta notificações nativas.');
    }
  };

  const showDesktopNotification = (ticket: Ticket) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(`🚨 Novo Chamado: ${ticket.code}`, {
          body: `${ticket.title}\nSetor: ${ticket.department} (${ticket.equipmentType})`,
          icon: '/favicon.ico'
        });
        notif.onclick = () => {
          window.focus();
          setSelectedTicket(ticket);
          notif.close();
        };
      } catch (e) {
        console.warn('Desktop notification error:', e);
      }
    }
  };

  const [liveAlert, setLiveAlert] = useState<{
    id: string;
    code: string;
    title: string;
    department: string;
    equipmentType: EquipmentType;
    requesterName?: string;
    requesterContact?: string;
    ticket: Ticket;
  } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Production state (starts empty, ready for Supabase or local storage)
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const deletedTicketIds = getDeletedTicketIds();
    const saved = localStorage.getItem('guaranesia_prod_tickets');
    let list: Ticket[] = saved ? JSON.parse(saved) : [];
    const filtered = list.filter(t => !deletedTicketIds.includes(t.id));
    return normalizeTicketCodes(filtered);
  });

  const [technicians, setTechnicians] = useState<Technician[]>(() => {
    const deletedIds = getDeletedTechIds();
    const saved = localStorage.getItem('guaranesia_prod_technicians');
    let list: Technician[] = DEFAULT_TECHNICIANS;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
      } catch (e) {}
    }
    return list.filter(t => !deletedIds.includes(t.id));
  });

  const [equipment, setEquipment] = useState<Equipment[]>(() => {
    const saved = localStorage.getItem('guaranesia_prod_equipment');
    return saved ? JSON.parse(saved) : [];
  });

  const [departments, setDepartments] = useState<string[]>(() => {
    const deletedDepts = getDeletedDepartments();
    const saved = localStorage.getItem('guaranesia_prod_departments');
    let list = saved ? JSON.parse(saved) : DEFAULT_DEPARTMENTS;
    if (!Array.isArray(list) || list.length === 0) list = DEFAULT_DEPARTMENTS;
    const filtered = list.filter((d: string) => !deletedDepts.some(dd => dd.toLowerCase() === d.toLowerCase()));
    return sortDepartments(filtered);
  });

  useEffect(() => {
    localStorage.setItem('guaranesia_prod_tickets', JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    localStorage.setItem('guaranesia_prod_technicians', JSON.stringify(technicians));
  }, [technicians]);

  useEffect(() => {
    localStorage.setItem('guaranesia_prod_equipment', JSON.stringify(equipment));
  }, [equipment]);

  useEffect(() => {
    localStorage.setItem('guaranesia_prod_departments', JSON.stringify(departments));
  }, [departments]);

  const [isServerSynced, setIsServerSynced] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState(false);

  // Full Server & Cloud (Supabase) Database Synchronization Function
  const syncWithServer = async (manualScan = false) => {
    try {
      let localTickets: Ticket[] = [];
      let localTechs: Technician[] = [];
      let localEq: Equipment[] = [];
      let localDepts: string[] = [];

      try {
        const t = localStorage.getItem('guaranesia_prod_tickets');
        if (t) localTickets = JSON.parse(t);
        const tc = localStorage.getItem('guaranesia_prod_technicians');
        if (tc) localTechs = JSON.parse(tc);
        const eq = localStorage.getItem('guaranesia_prod_equipment');
        if (eq) localEq = JSON.parse(eq);
        const d = localStorage.getItem('guaranesia_prod_departments');
        if (d) localDepts = JSON.parse(d);
      } catch (e) {
        console.warn('Error reading local cache on startup:', e);
      }

      // Always perform deep scan across all local storage keys to recover any departments/tickets
      const deepScan = scanAndRecoverAllLocalStorage();
      
      // Merge deep scanned departments into localDepts
      const mergedDeptsSet = new Set<string>([...localDepts, ...departments, ...deepScan.departments]);
      localDepts = Array.from(mergedDeptsSet);

      // Merge deep scanned tickets into localTickets
      deepScan.tickets.forEach(st => {
        if (!localTickets.some(lt => lt.id === st.id)) {
          localTickets.push(st);
        }
      });
      deepScan.equipment.forEach(seq => {
        if (!localEq.some(leq => leq.id === seq.id)) {
          localEq.push(seq);
        }
      });
      deepScan.technicians.forEach(stech => {
        if (!localTechs.some(ltech => ltech.id === stech.id)) {
          localTechs.push(stech);
        }
      });

      // 0. Auto-discover server-configured database credentials (for mobile devices)
      await fetchAndApplyServerCredentials();

      // 1. If Supabase Cloud is configured, synchronize with Cloud PostgreSQL
      if (isSupabaseReady()) {
        try {
          const cloudResult = await syncWithSupabase({
            tickets: localTickets,
            departments: localDepts,
            equipment: localEq,
            technicians: localTechs
          });

          if (cloudResult && cloudResult.success) {
            setIsServerSynced(true);
            if (Array.isArray(cloudResult.tickets)) {
              const normalized = normalizeTicketCodes(cloudResult.tickets);
              setTickets(normalized);
              try { localStorage.setItem('guaranesia_prod_tickets', JSON.stringify(normalized)); } catch (e) {}
            }
            if (Array.isArray(cloudResult.departments) && cloudResult.departments.length > 0) {
              setDepartments(sortDepartments(cloudResult.departments));
              try { localStorage.setItem('guaranesia_prod_departments', JSON.stringify(cloudResult.departments)); } catch (e) {}
            }
            if (Array.isArray(cloudResult.equipment)) {
              setEquipment(cloudResult.equipment);
              try { localStorage.setItem('guaranesia_prod_equipment', JSON.stringify(cloudResult.equipment)); } catch (e) {}
            }
            if (Array.isArray(cloudResult.technicians)) {
              setTechnicians(cloudResult.technicians);
              try { localStorage.setItem('guaranesia_prod_technicians', JSON.stringify(cloudResult.technicians)); } catch (e) {}
            }

            if (manualScan) {
              setSyncStatusMsg(`Sincronização em Nuvem (Supabase) concluída! ${cloudResult.tickets?.length || 0} chamado(s) e ${cloudResult.departments?.length || 0} setor(es) ativos.`);
              setTimeout(() => setSyncStatusMsg(null), 4000);
            }
            return;
          } else if (cloudResult && !cloudResult.success && cloudResult.error === 'Tabelas não encontradas') {
             // Let the user know tables are missing but don't stop the flow
             console.warn('Cloud sync: tables missing in Supabase');
             if (manualScan) setSyncStatusMsg('Conectado ao Supabase, mas as tabelas não foram encontradas. Vá em Configurações > Criar Tabelas.');
          }
        } catch (cloudErr) {
          console.warn('Supabase cloud sync notice:', cloudErr);
        }
      }

      // 2. Call the server sync API to merge client and server data into data/*.json
      try {
        const res = await fetch('/api/system/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tickets: localTickets,
            technicians: localTechs,
            equipment: localEq,
            departments: localDepts
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setIsServerSynced(true);
            if (Array.isArray(data.tickets)) {
              const normalized = normalizeTicketCodes(data.tickets);
              setTickets(normalized);
              try {
                localStorage.setItem('guaranesia_prod_tickets', JSON.stringify(normalized));
              } catch (e) {}
            }
            if (Array.isArray(data.technicians)) {
              setTechnicians(data.technicians);
              try {
                localStorage.setItem('guaranesia_prod_technicians', JSON.stringify(data.technicians));
              } catch (e) {}
            }
            if (Array.isArray(data.equipment)) {
              setEquipment(data.equipment);
              try {
                localStorage.setItem('guaranesia_prod_equipment', JSON.stringify(data.equipment));
              } catch (e) {}
            }
            if (Array.isArray(data.departments) && data.departments.length > 0) {
              setDepartments(sortDepartments(data.departments));
              try {
                localStorage.setItem('guaranesia_prod_departments', JSON.stringify(data.departments));
              } catch (e) {}
            }

            if (manualScan) {
              setSyncStatusMsg(`Banco de dados sincronizado com sucesso! ${data.tickets.length} chamado(s) e ${data.departments.length} setor(es) ativos.`);
              setTimeout(() => setSyncStatusMsg(null), 4000);
            }
          }
        }
      } catch (err: any) {
        console.warn('Server storage sync notice (expected on static Vercel):', err);
      }
    } catch (err: any) {
      console.warn('Could not sync with storage:', err);
    }
  };

  // Synchronize on application mount, after login, and periodically
  useEffect(() => {
    syncWithServer(false);

    // Setup auto-polling every 60 seconds
    const interval = setInterval(() => {
      syncWithServer(false);
    }, 60000);

    // Also sync when window regains focus (user switches back to tab)
    const handleFocus = () => {
      syncWithServer(false);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated]);


  // Real-time Server-Sent Events (SSE) listener for push notifications and chime alerts
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events/notifications');
      
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'NEW_TICKET' && payload.ticket) {
            const incomingTicket: Ticket = payload.ticket;
            
            setTickets(prev => {
              if (prev.some(t => t.id === incomingTicket.id || t.code === incomingTicket.code)) {
                return prev;
              }
              return [incomingTicket, ...prev];
            });

            // Trigger audio alert synthesizer chime
            playTicketAlertSound();

            // Trigger OS native desktop push notification
            showDesktopNotification(incomingTicket);

            // Display on-screen pulsating alert
            setLiveAlert({
              id: incomingTicket.id,
              code: incomingTicket.code,
              title: incomingTicket.title,
              department: incomingTicket.department,
              equipmentType: incomingTicket.equipmentType,
              requesterName: incomingTicket.requesterName,
              requesterContact: incomingTicket.requesterContact,
              ticket: incomingTicket
            });

            // Temporarily flash document title
            const origTitle = document.title;
            document.title = `🚨 (${incomingTicket.code}) Novo Chamado!`;
            setTimeout(() => {
              document.title = origTitle;
            }, 9000);
          }
        } catch (err) {
          console.error('Error handling notification payload:', err);
        }
      };
    } catch (e) {
      console.error('SSE initialization error:', e);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabledState(nextState);
    setSoundEnabled(nextState);
    if (nextState) {
      initAudioContext();
      playTicketAlertSound();
    }
  };

  const getPortalLink = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/?portal=servidor`;
    }
    return '';
  };

  const copyPortalLink = () => {
    navigator.clipboard.writeText(getPortalLink());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Modals & Active View states
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [celebrationToast, setCelebrationToast] = useState<{
    code: string;
    status: TicketStatus;
  } | null>(null);
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [isNewTechOpen, setIsNewTechOpen] = useState(false);
  const [isNewEqOpen, setIsNewEqOpen] = useState(false);
  const [isNewDeptOpen, setIsNewDeptOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  
  // Print Filter states
  const [printTechId, setPrintTechId] = useState('todos');
  const [printStatus, setPrintStatus] = useState('todos');
  const [printType, setPrintType] = useState('todos');
  const [printDept, setPrintDept] = useState('todos');
  const [printStartDate, setPrintStartDate] = useState('');
  const [printEndDate, setPrintEndDate] = useState('');
  const [printSingleTicketId, setPrintSingleTicketId] = useState<string | null>(null);
  const [selectedDailyTicketIds, setSelectedDailyTicketIds] = useState<string[]>([]);
  const [onlyPrintSelectedDaily, setOnlyPrintSelectedDaily] = useState<boolean>(false);

  // Add Note Form states inside ticket details modal
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteAuthor, setNewNoteAuthor] = useState('Administrador (Prefeitura)');
  const [partInput, setPartInput] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [priorityFilter, setPriorityFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // New Ticket Form state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<EquipmentType>('Impressora');
  const [newDept, setNewDept] = useState(departments[0] || '');
  const [newPriority, setNewPriority] = useState<Priority>('Média');
  const [newDesc, setNewDesc] = useState('');
  const [newDeadline, setNewDeadline] = useState(''); // Novo estado
  const [newTechId, setNewTechId] = useState('');
  const [newEqId, setNewEqId] = useState('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  // New Tech Form state
  const [techName, setTechName] = useState('');
  const [techType, setTechType] = useState<'Interno' | 'Terceirizado'>('Interno');
  const [techCompany, setTechCompany] = useState('');
  const [techPhone, setTechPhone] = useState('');
  const [techEmail, setTechEmail] = useState('');
  const [techSpecialty, setTechSpecialty] = useState('');
  const [techUsername, setTechUsername] = useState('');
  const [techPassword, setTechPassword] = useState('');
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);

  // New Equipment Form state
  const [eqName, setEqName] = useState('');
  const [eqType, setEqType] = useState<EquipmentType>('Impressora');
  const [eqModel, setEqModel] = useState('');
  const [eqSerial, setEqSerial] = useState('');
  const [eqDept, setEqDept] = useState(departments[0] || '');
  const [eqIp, setEqIp] = useState('');

  // New Department Form state
  const [deptName, setDeptName] = useState('');
  const [editingDept, setEditingDept] = useState<{ oldName: string; newName: string } | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<string | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<{ id: string; code: string } | null>(null);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);

  // Keep default selected department in sync with alphabetical first department
  useEffect(() => {
    if (departments.length > 0 && (!newDept || !departments.includes(newDept))) {
      setNewDept(departments[0]);
    }
  }, [departments, newDept]);

  useEffect(() => {
    if (departments.length > 0 && (!eqDept || !departments.includes(eqDept))) {
      setEqDept(departments[0]);
    }
  }, [departments, eqDept]);

  // Handle creating a new ticket with AI diagnosis trigger
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) return;

    setIsAiAnalyzing(true);
    let aiDiagnosis = undefined;

    try {
      const res = await fetch('/api/gemini/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          equipmentType: newType,
          department: newDept
        })
      });
      const data = await res.json();
      if (data.success) {
        aiDiagnosis = data.result;
      }
    } catch (err) {
      console.error('AI diagnosis error:', err);
    } finally {
      setIsAiAnalyzing(false);
    }

    const code = generateUniqueTicketCode(tickets);
    const now = new Date().toISOString();

    const newTicketObj: Ticket = {
      id: `t-${Date.now()}`,
      code,
      equipmentId: newEqId || undefined,
      equipmentType: newType,
      department: newDept,
      title: newTitle,
      description: newDesc,
      status: 'Aberto',
      priority: newPriority,
      technicianId: newTechId || undefined,
      createdAt: now,
      updatedAt: now,
      deadline: newDeadline ? new Date(newDeadline).toISOString() : calculateDefaultDeadline(newPriority, new Date(now)),
      notes: [
        { id: `n-${Date.now()}`, author: 'Administrador (Prefeitura)', text: 'Chamado cadastrado no sistema.', timestamp: now }
      ],
      aiDiagnosis
    };

    const updatedTickets = [newTicketObj, ...tickets];
    setTickets(updatedTickets);
    setNewTitle('');
    setNewDesc('');
    setIsNewTicketOpen(false);

    // Persist directly to Supabase Cloud Database (if connected)
    saveTicketToSupabase(newTicketObj, updatedTickets);

    // Save directly to server disk and broadcast event across all clients
    fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTicketObj)
    }).catch(err => console.warn('Error saving ticket to server:', err));
  };

  const handleAddTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!techName.trim()) return;

    const newTech: Technician = {
      id: `tech-${Date.now()}`,
      name: techName.trim(),
      type: techType,
      company: techType === 'Terceirizado' ? techCompany.trim() : undefined,
      phone: techPhone.trim(),
      email: techEmail.trim(),
      specialty: techSpecialty.trim(),
      username: techUsername.trim() || undefined,
      password: techPassword.trim() || undefined
    };

    const updated = [...technicians, newTech];
    setTechnicians(updated);
    setTechName('');
    setTechCompany('');
    setTechPhone('');
    setTechEmail('');
    setTechSpecialty('');
    setTechUsername('');
    setTechPassword('');
    setIsNewTechOpen(false);

    try {
      localStorage.setItem('guaranesia_prod_technicians', JSON.stringify(updated));
    } catch (e) {}

    // Persist to server disk
    try {
      await fetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTech)
      });
    } catch (err) {
      console.warn('Error saving technician to server:', err);
    }
  };

  const handleSaveEditedTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTechnician || !editingTechnician.name.trim()) return;

    const updatedTechs = technicians.map(t => t.id === editingTechnician.id ? editingTechnician : t);
    setTechnicians(updatedTechs);
    setEditingTechnician(null);

    try {
      localStorage.setItem('guaranesia_prod_technicians', JSON.stringify(updatedTechs));
    } catch (e) {}

    try {
      await fetch(`/api/technicians/${editingTechnician.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTechnician)
      });
    } catch (err) {
      console.warn('Error updating technician on server:', err);
    }
  };

  const handleDeleteTechnician = async (techId: string) => {
    const deletedIds = getDeletedTechIds();
    if (!deletedIds.includes(techId)) {
      deletedIds.push(techId);
      try {
        localStorage.setItem('guaranesia_deleted_tech_ids', JSON.stringify(deletedIds));
      } catch (e) {}
    }
    const updatedTechs = technicians.filter(t => t.id !== techId);
    setTechnicians(updatedTechs);
    try {
      localStorage.setItem('guaranesia_prod_technicians', JSON.stringify(updatedTechs));
    } catch (e) {}

    deleteTechnicianFromSupabase(techId);

    try {
      await fetch(`/api/technicians/${techId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Error deleting technician from server:', err);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eqName.trim()) return;

    const newEq: Equipment = {
      id: `eq-${Date.now()}`,
      name: eqName,
      type: eqType,
      model: eqModel,
      serialNumber: eqSerial,
      department: eqDept,
      ipAddress: eqIp || undefined,
      status: 'Operacional'
    };

    const updated = [...equipment, newEq];
    setEquipment(updated);
    setEqName('');
    setEqModel('');
    setEqSerial('');
    setEqIp('');
    setIsNewEqOpen(false);

    // Persist to server disk
    try {
      await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEq)
      });
    } catch (err) {
      console.warn('Error saving equipment to server:', err);
    }
  };

  const handleDeleteEquipment = async (eqId: string) => {
    setEquipment(prev => prev.filter(e => e.id !== eqId));
    try {
      await fetch(`/api/equipment/${eqId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Error deleting equipment from server:', err);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = deptName.trim();
    if (!cleanName) return;
    if (departments.some(d => d.toLowerCase() === cleanName.toLowerCase())) {
      alert('Esta secretaria/setor já está cadastrada.');
      return;
    }
    const updated = sortDepartments([...departments, cleanName]);
    setDepartments(updated);
    try {
      localStorage.setItem('guaranesia_prod_departments', JSON.stringify(updated));
    } catch (err) {}
    setDeptName('');
    setIsNewDeptOpen(false);

    // Save directly to Supabase Cloud Database (if connected)
    saveDepartmentToSupabase(cleanName, updated);

    // Persist to server API
    try {
      await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, departments: updated })
      });
    } catch (err) {
      console.warn('Error saving department to server:', err);
    }
  };

  const handleEditDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;
    const cleanNew = editingDept.newName.trim();
    if (!cleanNew) return;
    if (cleanNew.toLowerCase() !== editingDept.oldName.toLowerCase() && departments.some(d => d.toLowerCase() === cleanNew.toLowerCase())) {
      alert('Já existe uma secretaria/setor cadastrada com este nome.');
      return;
    }

    const updated = sortDepartments(departments.map(d => d === editingDept.oldName ? cleanNew : d));
    setDepartments(updated);
    try {
      localStorage.setItem('guaranesia_prod_departments', JSON.stringify(updated));
    } catch (err) {}

    // Update tickets and equipment referencing the old name
    setTickets(prev => prev.map(t => t.department === editingDept.oldName ? { ...t, department: cleanNew } : t));
    setEquipment(prev => prev.map(eq => eq.department === editingDept.oldName ? { ...eq, department: cleanNew } : eq));

    try {
      await fetch('/api/departments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: editingDept.oldName, newName: cleanNew, departments: updated })
      });
    } catch (err) {
      console.warn('Error updating department on server:', err);
    }

    setEditingDept(null);
  };

  const confirmDeleteDepartment = async (dept: string) => {
    const deletedDepts = getDeletedDepartments();
    if (!deletedDepts.includes(dept)) {
      deletedDepts.push(dept);
      try {
        localStorage.setItem('guaranesia_deleted_departments', JSON.stringify(deletedDepts));
      } catch (e) {}
    }
    const updated = sortDepartments(departments.filter(d => d.toLowerCase() !== dept.toLowerCase()));
    setDepartments(updated);
    try {
      localStorage.setItem('guaranesia_prod_departments', JSON.stringify(updated));
    } catch (err) {}

    // Delete from Supabase Cloud Database (if connected)
    deleteDepartmentFromSupabase(dept, updated);

    try {
      await fetch('/api/departments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: dept, departments: updated })
      });
    } catch (err) {
      console.warn('Error deleting department on server:', err);
    }

    setDeptToDelete(null);
    setDeleteToast(`Secretaria/Setor "${dept}" removido com sucesso.`);
    setTimeout(() => setDeleteToast(null), 4000);
  };

  const triggerCelebration = (status: TicketStatus, ticketCode: string) => {
    try {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 60,
          origin: { x: 0.1, y: 0.7 }
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 60,
          origin: { x: 0.9, y: 0.7 }
        });
      }, 200);
    } catch (e) {
      console.warn('Confetti effect notice:', e);
    }

    setCelebrationToast({ code: ticketCode, status });
    setTimeout(() => {
      setCelebrationToast(null);
    }, 6000);
  };

  const persistTicketUpdate = (ticket: Ticket) => {
    saveTicketToSupabase(ticket, tickets);
    fetch(`/api/tickets/${ticket.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket)
    }).catch(err => console.warn('Error updating ticket on server disk:', err));
  };

  const updateTicketStatus = (ticketId: string, newStatus: TicketStatus) => {
    let ticketCode = '';
    const currentTicket = tickets.find(t => t.id === ticketId);
    if (currentTicket) {
      ticketCode = currentTicket.code;
    }
    const wasNotCompleted = currentTicket && currentTicket.status !== 'Resolvido' && currentTicket.status !== 'Fechado';
    const isNowCompleted = newStatus === 'Resolvido' || newStatus === 'Fechado';

    setTickets(tickets.map(t => {
      if (t.id === ticketId) {
        const updated = {
          ...t,
          status: newStatus,
          updatedAt: new Date().toISOString(),
          notes: [
            ...t.notes,
            {
              id: `n-${Date.now()}`,
              author: 'Administrador (Prefeitura)',
              text: `Status alterado para: ${newStatus}`,
              timestamp: new Date().toISOString()
            }
          ]
        };
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(updated);
        }
        persistTicketUpdate(updated);
        return updated;
      }
      return t;
    }));

    if (wasNotCompleted && isNowCompleted && ticketCode) {
      triggerCelebration(newStatus, ticketCode);
    }
  };

  const handleDeleteTicket = (ticketId: string, ticketCode: string) => {
    setTicketToDelete({ id: ticketId, code: ticketCode });
  };

  const confirmDeleteTicket = (ticketId: string, ticketCode: string) => {
    const deletedTicketIds = getDeletedTicketIds();
    if (!deletedTicketIds.includes(ticketId)) {
      deletedTicketIds.push(ticketId);
      try {
        localStorage.setItem('guaranesia_deleted_ticket_ids', JSON.stringify(deletedTicketIds));
      } catch (e) {}
    }

    setTickets(prev => prev.filter(t => t.id !== ticketId));
    if (selectedTicket && selectedTicket.id === ticketId) {
      setSelectedTicket(null);
    }
    if (editingTicket && editingTicket.id === ticketId) {
      setEditingTicket(null);
    }
    setTicketToDelete(null);
    setDeleteToast(`Chamado [${ticketCode}] apagado com sucesso.`);
    setTimeout(() => setDeleteToast(null), 4000);

    deleteTicketFromSupabase(ticketId);
    fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' }).catch(err => console.warn(err));
  };

  const handleSaveEditedTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    if (!editingTicket.title.trim() || !editingTicket.description.trim()) {
      alert('Por favor, preencha o título e a descrição do chamado.');
      return;
    }

    const previousTicket = tickets.find(t => t.id === editingTicket.id);
    const wasNotCompleted = previousTicket && previousTicket.status !== 'Resolvido' && previousTicket.status !== 'Fechado';
    const isNowCompleted = editingTicket.status === 'Resolvido' || editingTicket.status === 'Fechado';

    const now = new Date().toISOString();
    const updatedTicket: Ticket = {
      ...editingTicket,
      updatedAt: now,
      notes: [
        ...editingTicket.notes,
        {
          id: `n-${Date.now()}`,
          author: 'Administrador (Prefeitura)',
          text: `Chamado editado e dados atualizados pelo Administrador`,
          timestamp: now
        }
      ]
    };

    setTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
    if (selectedTicket && selectedTicket.id === updatedTicket.id) {
      setSelectedTicket(updatedTicket);
    }
    persistTicketUpdate(updatedTicket);
    setEditingTicket(null);

    if (wasNotCompleted && isNowCompleted) {
      triggerCelebration(updatedTicket.status, updatedTicket.code);
    }
  };

  const toggleArchiveTicket = (ticketId: string) => {
    setTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        const updated = {
          ...t,
          archived: !t.archived,
          updatedAt: new Date().toISOString(),
          notes: [
            ...t.notes,
            {
              id: `n-${Date.now()}`,
              author: 'Administrador (Prefeitura)',
              text: t.archived ? 'Chamado desarquivado.' : 'Chamado arquivado (oculto da tela inicial e gerenciamento).',
              timestamp: new Date().toISOString()
            }
          ]
        };
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(updated);
        }
        persistTicketUpdate(updated);
        return updated;
      }
      return t;
    }));
  };

  const assignTechnician = (ticketId: string, techId: string) => {
    const tech = technicians.find(tc => tc.id === techId);
    setTickets(tickets.map(t => {
      if (t.id === ticketId) {
        const updated = {
          ...t,
          technicianId: techId || undefined,
          updatedAt: new Date().toISOString(),
          notes: [
            ...t.notes,
            {
              id: `n-${Date.now()}`,
              author: 'Administrador (Prefeitura)',
              text: tech ? `Técnico atribuído: ${tech.name} (${tech.type}${tech.company ? ' - ' + tech.company : ''})` : 'Técnico desatribuído',
              timestamp: new Date().toISOString()
            }
          ]
        };
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(updated);
        }
        persistTicketUpdate(updated);
        return updated;
      }
      return t;
    }));
  };

  const handleAddNoteToTicket = (ticketId: string) => {
    if (!newNoteText.trim()) return;
    const now = new Date().toISOString();
    const newNote: TicketNote = {
      id: `n-${Date.now()}`,
      author: newNoteAuthor.trim() || 'Administrador (Prefeitura)',
      text: newNoteText.trim(),
      timestamp: now
    };

    setTickets(tickets.map(t => {
      if (t.id === ticketId) {
        const updated = {
          ...t,
          updatedAt: now,
          notes: [...t.notes, newNote]
        };
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(updated);
        }
        persistTicketUpdate(updated);
        return updated;
      }
      return t;
    }));
    setNewNoteText('');
  };

  const COMMON_PARTS_PRESETS = [
    'Toner Preto',
    'Toner Colorido',
    'Unidade de Imagem (Cilindro)',
    'Switch de Rede (8/16/24p)',
    'Roteador Wi-Fi',
    'Antena Wi-Fi / Receptor USB',
    'Cabo de Rede RJ-45 (Patch Cord)',
    'Cabo USB Impressora',
    'Conector RJ-45 (Crimpar)',
    'Filtro de Linha / DPS',
    'Fonte de Alimentação / Carregador',
    'Teclado / Mouse USB'
  ];

  const handleAddPartToTicket = (ticketId: string, partName: string) => {
    const cleanPart = partName.trim();
    if (!cleanPart) return;
    const now = new Date().toISOString();

    setTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        const currentParts = t.partsUsed || [];
        const updatedParts = [...currentParts, cleanPart];
        const updated = {
          ...t,
          partsUsed: updatedParts,
          updatedAt: now,
          notes: [
            ...t.notes,
            {
              id: `n-${Date.now()}`,
              author: newNoteAuthor.trim() || 'Técnico Responsável',
              text: `Equipamento/Peça utilizado registrado: "${cleanPart}"`,
              timestamp: now
            }
          ]
        };
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(updated);
        }
        persistTicketUpdate(updated);
        return updated;
      }
      return t;
    }));
    setPartInput('');
  };

  const handleRemovePartFromTicket = (ticketId: string, indexToRemove: number) => {
    const now = new Date().toISOString();
    setTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        const currentParts = t.partsUsed || [];
        const removedItem = currentParts[indexToRemove];
        const updatedParts = currentParts.filter((_, idx) => idx !== indexToRemove);
        const updated = {
          ...t,
          partsUsed: updatedParts,
          updatedAt: now,
          notes: [
            ...t.notes,
            {
              id: `n-${Date.now()}`,
              author: newNoteAuthor.trim() || 'Técnico Responsável',
              text: `Item/Peça removido do registro: "${removedItem}"`,
              timestamp: now
            }
          ]
        };
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(updated);
        }
        return updated;
      }
      return t;
    }));
  };

  // Overdue check: tickets with status 'Aberto' for more than 48 hours
  const isOverdue48h = (ticket: Ticket): boolean => {
    if (ticket.status !== 'Aberto') return false;
    const createdAtMs = new Date(ticket.createdAt).getTime();
    if (isNaN(createdAtMs)) return false;
    const diffHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);
    return diffHours >= 48;
  };

  const isNearDeadline = (ticket: Ticket): boolean => {
    if (!ticket.deadline || ticket.status === 'Resolvido' || ticket.status === 'Fechado' || ticket.status === 'Cancelado') return false;
    const deadlineMs = new Date(ticket.deadline).getTime();
    if (isNaN(deadlineMs)) return false;
    const now = Date.now();
    const daysUntil = (deadlineMs - now) / (1000 * 60 * 60 * 24);
    return daysUntil <= 2; // Warning if within 2 days
  };

  const getHoursOpen = (createdAt: string): number => {
    const createdAtMs = new Date(createdAt).getTime();
    if (isNaN(createdAtMs)) return 0;
    const diffMs = Math.max(0, Date.now() - createdAtMs);
    return Math.floor(diffMs / (1000 * 60 * 60));
  };

  // Stats calculation (ignore archived for main stats)
  const activeTickets = tickets.filter(t => !t.archived);
  const totalTickets = activeTickets.length;
  const openTickets = activeTickets.filter(t => t.status === 'Aberto' || t.status === 'Em Andamento' || t.status === 'Aguardando Peças').length;
  const resolvedTickets = activeTickets.filter(t => t.status === 'Resolvido' || t.status === 'Fechado').length;
  const criticalTickets = activeTickets.filter(t => t.priority === 'Crítica' && t.status !== 'Resolvido' && t.status !== 'Fechado').length;
  const overdueTickets48h = activeTickets.filter(isOverdue48h).length;

  // Filtered tickets
  const filteredTickets = tickets.filter(t => {
    // Manage archived visibility
    if (statusFilter === 'Arquivado') {
      if (!t.archived) return false;
    } else {
      if (t.archived) return false;
    }

    const matchesStatus = 
      statusFilter === 'todos' || statusFilter === 'Arquivado' ? true :
      statusFilter === 'pendente_48h' ? isOverdue48h(t) :
      t.status === statusFilter;
    const matchesType = typeFilter === 'todos' || t.equipmentType === typeFilter;
    const matchesPriority = priorityFilter === 'todos' || t.priority === priorityFilter;
    const matchesSearch = searchQuery === '' || 
      t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesType && matchesPriority && matchesSearch;
  });

  // Printable tickets filtering
  const printableTickets = tickets.filter(t => {
    if (printSingleTicketId) {
      return t.id === printSingleTicketId;
    }
    if (onlyPrintSelectedDaily && selectedDailyTicketIds.length > 0) {
      return selectedDailyTicketIds.includes(t.id);
    }
    const matchesTech = printTechId === 'todos' || t.technicianId === printTechId;
    const matchesStatus = printStatus === 'todos' || t.status === printStatus;
    const matchesType = printType === 'todos' || t.equipmentType === printType;
    const matchesDept = printDept === 'todos' || t.department === printDept;
    
    let matchesDate = true;
    const ticketDate = new Date(t.createdAt).getTime();
    if (printStartDate) {
      matchesDate = matchesDate && ticketDate >= new Date(printStartDate).getTime();
    }
    if (printEndDate) {
      const endDateTime = new Date(printEndDate).getTime() + 86400000;
      matchesDate = matchesDate && ticketDate <= endDateTime;
    }
    return matchesTech && matchesStatus && matchesType && matchesDept && matchesDate;
  });

  // Export filtered tickets to CSV format for external spreadsheets (Excel, Google Sheets, Calc)
  const handleExportCSV = () => {
    if (printableTickets.length === 0) {
      alert('Não há chamados para exportar com os filtros selecionados.');
      return;
    }

    const headers = [
      'Código',
      'Data de Abertura',
      'Título / Demanda',
      'Tipo de Serviço/Equipamento',
      'Secretaria / Setor',
      'Solicitante',
      'Contato Solicitante',
      'Status',
      'Prioridade',
      'Técnico Responsável',
      'Tipo do Técnico',
      'Empresa Terceirizada',
      'Peças / Equipamentos Utilizados',
      'Custo (R$)',
      'Descrição Detalhada',
      'Última Atualização'
    ];

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      const clean = String(val).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = printableTickets.map(t => {
      const tech = technicians.find(tc => tc.id === t.technicianId);
      const createdDate = new Date(t.createdAt).toLocaleString('pt-BR');
      const updatedDate = new Date(t.updatedAt).toLocaleString('pt-BR');
      const partsStr = t.partsUsed && t.partsUsed.length > 0 ? t.partsUsed.join(', ') : 'Nenhum';

      return [
        escapeCSV(t.code),
        escapeCSV(createdDate),
        escapeCSV(t.title),
        escapeCSV(t.equipmentType),
        escapeCSV(t.department),
        escapeCSV(t.requesterName || 'Não informado'),
        escapeCSV(t.requesterContact || ''),
        escapeCSV(t.status),
        escapeCSV(t.priority),
        escapeCSV(tech ? tech.name : 'Não atribuído'),
        escapeCSV(tech ? tech.type : ''),
        escapeCSV(tech?.company || ''),
        escapeCSV(partsStr),
        escapeCSV(t.cost ? t.cost.toFixed(2).replace('.', ',') : '0,00'),
        escapeCSV(t.description),
        escapeCSV(updatedDate)
      ].join(';');
    });

    // Add UTF-8 BOM (\uFEFF) for proper accented character support in Excel and LibreOffice
    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `chamados_guaranesia_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getEquipmentIcon = (type: EquipmentType) => {
    switch (type) {
      case 'Impressora':
      case 'Troca de Toner': return <Printer className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'Relógio de Ponto': return <Clock className="w-5 h-5 text-blue-600 shrink-0" />;
      case 'Telefone IP': return <Phone className="w-5 h-5 text-indigo-600 shrink-0" />;
      case 'Computador': return <Monitor className="w-5 h-5 text-purple-600 shrink-0" />;
      case 'Atualização do Site': return <Globe className="w-5 h-5 text-cyan-400 shrink-0" />;
      default: return <Wrench className="w-5 h-5 text-amber-600 shrink-0" />;
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'Aberto': return <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 rounded-md border border-amber-200 whitespace-nowrap">Aberto</span>;
      case 'Em Andamento': return <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 rounded-md border border-blue-200 whitespace-nowrap">Em Andamento</span>;
      case 'Aguardando Peças': return <span className="px-2 py-0.5 text-[11px] font-semibold bg-purple-50 text-purple-700 rounded-md border border-purple-200 whitespace-nowrap">Aguardando Peças</span>;
      case 'Resolvido': return <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200 whitespace-nowrap">Resolvido</span>;
      case 'Fechado': return <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-md border border-slate-200 whitespace-nowrap">Fechado</span>;
      case 'Cancelado': return <span className="px-2 py-0.5 text-[11px] font-semibold bg-rose-50 text-rose-700 rounded-md border border-rose-200 whitespace-nowrap">Cancelado</span>;
    }
  };

  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'Baixa': return <span className="text-xs text-slate-400 font-medium">Baixa</span>;
      case 'Média': return <span className="text-xs text-blue-400 font-medium">Média</span>;
      case 'Alta': return <span className="text-xs text-amber-400 font-semibold">Alta</span>;
      case 'Crítica': return <span className="text-xs text-rose-400 font-bold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-900">Crítica</span>;
    }
  };

  // Dedicated Technician Workbench / Control View (No Admin password required)
  if (viewMode === 'technician') {
    return (
      <TechnicianPortal
        technicians={technicians}
        tickets={tickets}
        onUpdateTicket={(updated) => {
          setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
          if (selectedTicket && selectedTicket.id === updated.id) {
            setSelectedTicket(updated);
          }
          persistTicketUpdate(updated);
        }}
        onDeleteTicket={(ticketId, code) => handleDeleteTicket(ticketId, code)}
        onAddTechnician={(newTech) => {
          setTechnicians(prev => [...prev, newTech]);
          try {
            fetch('/api/technicians', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newTech)
            }).catch(e => console.warn(e));
          } catch (e) {}
        }}
        onSwitchToAdmin={() => setViewMode('admin')}
        onSwitchToPortalServidor={() => setViewMode('portal')}
        onForceSync={() => syncWithServer(true)}
        isSyncing={!isServerSynced}
      />
    );
  }

  // If user accesses the Public Portal directly
  if (viewMode === 'portal') {
    return (
      <PortalServidor
        departments={sortDepartments(departments)}
        tickets={tickets}
        onTicketCreated={(created) => {
          setTickets(prev => [created, ...prev]);
        }}
        isAdminPreview={isAdminPreview}
        onSwitchToAdmin={() => {
          setIsAdminPreview(false);
          setViewMode('admin');
        }}
        onSwitchToTechnician={() => setViewMode('technician')}
      />
    );
  }

  // If not authenticated as administrator, show the secure login screen
  if (!isAuthenticated) {
    return (
      <AdminLogin
        onLoginSuccess={() => setIsAuthenticated(true)}
        onGoToTechnician={() => setViewMode('technician')}
        onGoToPublicPortal={() => setViewMode('portal')}
      />
    );
  }

  return (
    <div 
      onClick={() => initAudioContext()}
      className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans max-w-[100vw] overflow-x-hidden relative"
    >
      {/* Task Completion Celebration Toast / Banner */}
      {celebrationToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-emerald-950 border-2 border-emerald-400 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3.5 backdrop-blur-md animate-in slide-in-from-top-6 duration-300 ring-4 ring-emerald-500/30">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-300 shrink-0 text-2xl shadow-inner">
            🎉
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" />
              <span>Chamado {celebrationToast.status}!</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-100 font-medium mt-0.5">
              O chamado <span className="font-mono font-bold text-emerald-300">{celebrationToast.code}</span> foi concluído com sucesso. Excelente trabalho!
            </p>
          </div>
          <button
            onClick={() => setCelebrationToast(null)}
            className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Delete / Removal Success Toast */}
      {deleteToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-slate-950 border-2 border-rose-500/80 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-6 duration-300 ring-4 ring-rose-500/20">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block">Item Removido</span>
            <p className="text-xs sm:text-sm text-slate-200 mt-0.5">{deleteToast}</p>
          </div>
          <button
            onClick={() => setDeleteToast(null)}
            className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* On-Screen Live Alert Banner */}
      {liveAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-sm sm:max-w-md w-[calc(100%-2rem)] bg-slate-950 border-2 border-emerald-500 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 backdrop-blur-md animate-in slide-in-from-top-4 duration-300 ring-4 ring-emerald-500/20">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                <BellRing className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Novo Chamado Recebido!
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-white mt-0.5 line-clamp-1">
                  {liveAlert.code} - {liveAlert.title}
                </h4>
              </div>
            </div>
            <button 
              onClick={() => setLiveAlert(null)}
              className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800"
            >
              ✕
            </button>
          </div>

          <div className="text-xs text-slate-300 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Setor/Secretaria:</span>
              <span className="font-semibold text-white truncate max-w-[190px]">{liveAlert.department}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Serviço:</span>
              <span className="font-semibold text-emerald-400">{liveAlert.equipmentType}</span>
            </div>
            {liveAlert.requesterName && (
              <div className="flex justify-between">
                <span className="text-slate-400">Solicitante:</span>
                <span className="font-semibold text-white">{liveAlert.requesterName} {liveAlert.requesterContact ? `(${liveAlert.requesterContact})` : ''}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                setSelectedTicket(liveAlert.ticket);
                setLiveAlert(null);
              }}
              className="flex-1 py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Ver Chamado Agora</span>
            </button>
            <button
              onClick={() => setLiveAlert(null)}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
            >
              Dispensar
            </button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800 px-3 sm:px-6 py-2.5 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 w-full max-w-full shadow-sm no-print">
        <div className="flex items-center justify-between w-full sm:w-auto gap-2 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shadow-md shrink-0 text-xs sm:text-base">
              MG
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-white truncate max-w-[180px] sm:max-w-none">
                Prefeitura de Guaranésia
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                <span>Painel Admin</span>
                <span 
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono cursor-help transition-all ${isSupabaseReady() ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                  title={isSupabaseReady() ? 'Conectado ao Supabase Cloud' : 'Armazenamento Local apenas'}
                >
                  <Database className="w-3 h-3" /> {isSupabaseReady() ? 'Supabase ONLINE' : 'Modo LOCAL'}
                </span>
                {!isServerSynced && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800 animate-pulse">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" /> SINCRONIZANDO...
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Quick Actions for Mobile in top row */}
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            <button
              onClick={() => setViewMode('technician')}
              className="px-2 py-1 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1"
              title="Ir para Área do Técnico"
            >
              <Wrench className="w-3 h-3 text-emerald-400" />
              <span>Técnico</span>
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('guaranesia_admin_auth');
                setIsAuthenticated(false);
              }}
              className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-300 hover:text-rose-400 rounded-lg text-[11px] font-medium flex items-center gap-1"
              title="Sair do painel"
            >
              <LogOut className="w-3 h-3" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-300">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'dashboard' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-500' : 'hover:text-white'}`}
          >
            Painel Geral
          </button>
          <button 
            onClick={() => setActiveTab('tickets')} 
            className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'tickets' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-500' : 'hover:text-white'}`}
          >
            Chamados ({openTickets} abertos)
          </button>
          <button 
            onClick={() => setActiveTab('equipment')} 
            className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'equipment' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-500' : 'hover:text-white'}`}
          >
            Inventário ({equipment.length})
          </button>
          <button 
            onClick={() => setActiveTab('departments')} 
            className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'departments' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-500' : 'hover:text-white'}`}
          >
            Setores ({departments.length})
          </button>
          <button 
            onClick={() => setActiveTab('technicians')} 
            className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'technicians' ? 'text-emerald-400 font-semibold border-b-2 border-emerald-500' : 'hover:text-white'}`}
          >
            Técnicos ({technicians.length})
          </button>
          <button 
            onClick={() => setViewMode('technician')} 
            className="transition-colors whitespace-nowrap py-1 text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5 bg-emerald-950/60 px-2.5 rounded-lg border border-emerald-800/60"
            title="Abrir tela de controle do técnico"
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-400" />
            <span>Área do Técnico</span>
          </button>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
          {/* Manual Force Sync Button */}
          <button
            onClick={() => syncWithServer(true)}
            disabled={!isServerSynced}
            className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-emerald-500 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 group"
            title="Forçar sincronização com o banco de dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 group-hover:rotate-180 transition-transform duration-500 ${!isServerSynced ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>

          {/* Audio Chime Notification Toggle */}
          <button
            onClick={toggleSound}
            className={`px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
              soundEnabled 
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? 'Aviso sonoro ativado (clique para silenciar)' : 'Aviso sonoro desativado (clique para ativar)'}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Som</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="hidden sm:inline">Mudo</span>
              </>
            )}
          </button>

          {/* Native OS Desktop Notification Toggle */}
          <button
            onClick={requestNotificationPermission}
            className={`px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
              notifPermission === 'granted'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={notifPermission === 'granted' ? 'Notificações nativas ativadas' : 'Ativar notificações nativas'}
          >
            <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">
              {notifPermission === 'granted' ? 'Push Ativo' : 'Push'}
            </span>
          </button>

          {/* Share Portal Link button */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-800/60 rounded-lg hover:bg-cyan-900/50 transition-colors flex items-center gap-1.5"
            title="Compartilhar Link para os Servidores Abrirem Chamados"
          >
            <Link2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="hidden sm:inline">Link Servidores</span>
          </button>

          {/* Switch to technician view */}
          <button
            onClick={() => setViewMode('technician')}
            className="px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 rounded-lg hover:bg-emerald-900/60 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Acessar Bancada de Controle de Chamados do Técnico"
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Área do Técnico</span>
          </button>

          {/* Switch to public view for testing */}
          <button
            onClick={() => {
              setIsAdminPreview(true);
              setViewMode('portal');
            }}
            className="px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            title="Testar como Servidor Municipal (Tela do Solicitante)"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="hidden md:inline">Visão Servidor</span>
          </button>

          <button 
            onClick={() => setIsPrintModalOpen(true)}
            className="px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            title="Imprimir Relatórios"
          >
            <Print className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Relatório</span>
          </button>

          {/* Cloud Sync & Supabase Modal Button */}
          <button
            onClick={() => setIsCloudSyncModalOpen(true)}
            className={`px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors ${
              isSupabaseReady() 
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60'
                : 'bg-amber-950/60 text-amber-300 border-amber-500/40 hover:bg-amber-900/60'
            }`}
            title="Conexão com Banco de Dados em Nuvem (Supabase & Vercel)"
          >
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{isSupabaseReady() ? 'Nuvem Conectada' : 'Conectar Nuvem'}</span>
          </button>

          {/* Daily Backup & Supabase Sync Button */}
          <button
            onClick={() => setIsBackupModalOpen(true)}
            className="px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            title="Rotina de Backup Diário e Armazenamento no Supabase"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="hidden sm:inline">Backup</span>
          </button>
          
          <button 
            onClick={() => setIsNewTicketOpen(true)}
            className="px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-bold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors whitespace-nowrap shadow-md flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Novo Chamado</span>
          </button>

          {/* Admin user session & logout button (Desktop) */}
          <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
            <span className="hidden xl:inline font-mono text-[11px] text-slate-300">digitalpersonal@gmail.com</span>
            <span className="xl:hidden font-semibold text-[11px] text-slate-300">Admin</span>
            <button
              onClick={() => {
                localStorage.removeItem('guaranesia_admin_auth');
                setIsAuthenticated(false);
              }}
              className="text-slate-400 hover:text-rose-400 p-1 transition-colors flex items-center gap-1"
              title="Sair do painel administrativo"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Nav Tabs */}
      <div className="lg:hidden flex overflow-x-auto w-full max-w-full bg-slate-950 border-b border-slate-800 px-3 py-2 gap-1.5 no-print scrollbar-none">
        <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'}`}>Painel</button>
        <button onClick={() => setActiveTab('tickets')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'tickets' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'}`}>Chamados</button>
        <button onClick={() => setActiveTab('equipment')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'equipment' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'}`}>Inventário</button>
        <button onClick={() => setActiveTab('departments')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'departments' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'}`}>Setores</button>
        <button onClick={() => setActiveTab('technicians')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'technicians' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'}`}>Técnicos</button>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 p-3.5 sm:p-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden min-w-0">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Welcome banner */}
            <div className="bg-gradient-to-r from-emerald-900/40 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-[11px] sm:text-xs font-semibold tracking-wider text-emerald-400 uppercase">Prefeitura Municipal de Guaranésia • MG (Produção)</span>
                <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">Central de Manutenção e Suporte Técnico</h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
                  Sistema com gravação permanente em disco no servidor para controle de chamados, impressoras, toners, relógios de ponto, telefones IP e computadores.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full md:w-auto">
                <button 
                  onClick={() => setIsPrintModalOpen(true)}
                  className="flex-1 md:flex-initial px-4 py-2.5 bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <Print className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Imprimir Relatórios</span>
                </button>
                <button 
                  onClick={() => setIsNewTicketOpen(true)}
                  className="flex-1 md:flex-initial px-4 py-2.5 bg-emerald-500 text-slate-950 text-xs sm:text-sm font-bold rounded-xl hover:bg-emerald-400 transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Novo Chamado</span>
                </button>
              </div>
            </div>

            {/* Sync status message toast if active */}
            {syncStatusMsg && (
              <div className="bg-emerald-500/20 border border-emerald-500 rounded-xl p-3 text-xs text-emerald-300 font-medium flex items-center justify-between gap-2">
                <span>{syncStatusMsg}</span>
                <button onClick={() => setSyncStatusMsg(null)} className="text-emerald-400 hover:text-white text-xs">✕</button>
              </div>
            )}

            {/* Production Mode Status & Empty State */}
            {tickets.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Modo Produção Oficial Ativo • Banco de Dados Permanente Conectado</span>
                </div>

                <div className="max-w-md mx-auto">
                  <h3 className="text-base sm:text-lg font-bold text-white">Nenhum chamado aberto na fila</h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    O sistema está operando em Modo de Produção Oficial com gravação contínua no servidor. Todos os chamados cadastrados pelos técnicos ou servidores municipais são gravados diretamente e com segurança no banco de dados permanente.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewTicketOpen(true)}
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Abrir Novo Chamado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => syncWithServer(true)}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                    title="Sincronizar banco de dados no servidor"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sincronizar Banco</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-slate-300 font-medium">Modo Produção Oficial:</span>
                  <span className="font-mono text-emerald-400 font-bold">{tickets.length} chamado(s) salvo(s) no banco de dados</span>
                </div>
                <button
                  type="button"
                  onClick={() => syncWithServer(true)}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 hover:underline"
                  title="Sincronizar dados com o banco do servidor"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar Banco</span>
                </button>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4 min-w-0 max-w-full">
              <div 
                onClick={() => {
                  setStatusFilter('todos');
                  setPriorityFilter('todos');
                  setTypeFilter('todos');
                  setActiveTab('tickets');
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-5 shadow-sm cursor-pointer hover:border-emerald-500/60 transition-all group min-w-0"
                title="Clique para ver todos os chamados"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-sm text-slate-400 group-hover:text-emerald-300 truncate">Total</span>
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0 ml-1" />
                </div>
                <div className="text-xl sm:text-3xl font-bold text-white mt-1.5 sm:mt-2 tabular-nums">{totalTickets}</div>
                <div className="text-[10px] sm:text-xs text-slate-500 mt-1 truncate">Registrados</div>
              </div>

              <div 
                onClick={() => {
                  setStatusFilter('Aberto');
                  setPriorityFilter('todos');
                  setActiveTab('tickets');
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-5 shadow-sm cursor-pointer hover:border-blue-500/60 transition-all group min-w-0"
                title="Clique para ver chamados em atendimento"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-sm text-slate-400 group-hover:text-blue-300 truncate">Em Atendimento</span>
                  <Clock3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0 ml-1" />
                </div>
                <div className="text-xl sm:text-3xl font-bold text-white mt-1.5 sm:mt-2 tabular-nums">{openTickets}</div>
                <div className="text-[10px] sm:text-xs text-blue-400 mt-1 truncate">Abertos / Em andamento</div>
              </div>

              <div 
                onClick={() => {
                  if (overdueTickets48h > 0) {
                    setStatusFilter('pendente_48h');
                    setActiveTab('tickets');
                  }
                }}
                className={`bg-slate-950 border rounded-xl p-3 sm:p-5 shadow-sm transition-all min-w-0 ${
                  overdueTickets48h > 0 
                    ? 'border-amber-400 bg-amber-500/10 cursor-pointer hover:border-amber-300 ring-1 ring-amber-400/50' 
                    : 'border-slate-800'
                }`}
                title={overdueTickets48h > 0 ? "Clique para filtrar chamados pendentes há mais de 48h" : "Nenhum chamado pendente há mais de 48h"}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] sm:text-sm truncate ${overdueTickets48h > 0 ? 'text-amber-300 font-semibold' : 'text-slate-400'}`}>Pendentes &gt; 48h</span>
                  <AlertTriangle className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ml-1 ${overdueTickets48h > 0 ? 'text-amber-400 animate-bounce' : 'text-slate-600'}`} />
                </div>
                <div className={`text-xl sm:text-3xl font-bold mt-1.5 sm:mt-2 tabular-nums ${overdueTickets48h > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {overdueTickets48h}
                </div>
                <div className={`text-[10px] sm:text-xs mt-1 truncate ${overdueTickets48h > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}`}>
                  {overdueTickets48h > 0 ? 'Atenção necessária' : 'Em dia'}
                </div>
              </div>

              <div 
                onClick={() => {
                  setStatusFilter('Resolvido');
                  setPriorityFilter('todos');
                  setActiveTab('tickets');
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-5 shadow-sm cursor-pointer hover:border-emerald-500/60 transition-all group min-w-0"
                title="Clique para ver chamados resolvidos"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-sm text-slate-400 group-hover:text-emerald-300 truncate">Resolvidos</span>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0 ml-1" />
                </div>
                <div className="text-xl sm:text-3xl font-bold text-white mt-1.5 sm:mt-2 tabular-nums">{resolvedTickets}</div>
                <div className="text-[10px] sm:text-xs text-emerald-400 mt-1 truncate">Concluídos</div>
              </div>

              <div 
                onClick={() => {
                  setPriorityFilter('Crítica');
                  setStatusFilter('todos');
                  setActiveTab('tickets');
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-5 shadow-sm cursor-pointer hover:border-rose-500/60 transition-all group col-span-2 sm:col-span-1 min-w-0"
                title="Clique para filtrar chamados de prioridade Crítica"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] sm:text-sm text-slate-400 group-hover:text-rose-300 truncate">Críticos</span>
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0 ml-1" />
                </div>
                <div className="text-xl sm:text-3xl font-bold text-rose-400 mt-1.5 sm:mt-2 tabular-nums">{criticalTickets}</div>
                <div className="text-[10px] sm:text-xs text-rose-500 mt-1 truncate">Urgência alta</div>
              </div>
            </div>

            {/* Recharts Analytics Section: Monthly Resolutions & Sector Distribution */}
            <DashboardCharts tickets={activeTickets} departments={departments} />

            {/* Overdue 48h Warning Alert Banner if any open tickets > 48h */}
            {overdueTickets48h > 0 && (
              <div className="bg-amber-500/10 border-2 border-amber-400/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-200 shadow-lg shadow-amber-950/20">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 shrink-0 animate-pulse">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-amber-300 flex items-center gap-2">
                      <span>Sinalização de Atenção: {overdueTickets48h} chamado(s) aberto(s) há mais de 48 horas!</span>
                    </h4>
                    <p className="text-xs text-amber-200/85 mt-0.5 leading-relaxed">
                      Estes chamados foram abertos há mais de 2 dias e continuam aguardando atendimento. Verifique a lista para priorizar os reparos nos setores municipais.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('pendente_48h');
                    setActiveTab('tickets');
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs whitespace-nowrap transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow"
                >
                  <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />
                  <span>Ver Pendentes (+48h)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick overview grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent tickets list */}
              <div className="lg:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-base sm:text-lg text-white">Chamados Recentes</h3>
                  <button onClick={() => setActiveTab('tickets')} className="text-xs text-emerald-400 hover:underline flex items-center gap-1">
                    Ver todos <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {tickets.slice(0, 5).map(ticket => {
                    const tech = technicians.find(t => t.id === ticket.technicianId);
                    const isOverdue = isOverdue48h(ticket);
                    return (
                      <div 
                        key={ticket.id} 
                        onClick={() => setSelectedTicket(ticket)}
                        className={`rounded-xl p-3.5 sm:p-4 transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border ${
                          isOverdue 
                            ? 'bg-amber-500/[0.08] border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.18)] hover:bg-amber-500/[0.12] hover:border-amber-300 ring-1 ring-amber-400/40' 
                            : 'bg-slate-900 border-slate-800/80 hover:border-emerald-500/50'
                        }`}
                      >
                        <div className="flex items-start gap-3 w-full sm:w-auto">
                          <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${isOverdue ? 'bg-amber-500/20 text-amber-400 border border-amber-400/50' : 'bg-slate-800'}`}>
                            {getEquipmentIcon(ticket.equipmentType)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono text-emerald-400">{ticket.code}</span>
                              <span aria-hidden="true" className="hidden sm:inline">·</span>
                              <span className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-none">{ticket.department}</span>
                              {isOverdue && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400 animate-pulse">
                                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                  Aberto há +{getHoursOpen(ticket.createdAt)}h
                                </span>
                              )}
                            </div>
                            <h4 className="font-semibold text-white text-sm mt-0.5 truncate">{ticket.title}</h4>
                            <div className="flex items-center gap-2 mt-1.5 text-[11px] sm:text-xs text-slate-400 flex-wrap">
                              <span>Técnico: <strong className="text-slate-200">{tech ? tech.name : 'Não atribuído'}</strong></span>
                              <span aria-hidden="true">·</span>
                              <span>Prioridade: {getPriorityBadge(ticket.priority)}</span>
                              {ticket.partsUsed && ticket.partsUsed.length > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 font-medium bg-amber-950/40 border border-amber-800/60 rounded px-1.5 py-0.5">
                                    <Package className="w-3 h-3 text-amber-400" /> {ticket.partsUsed.length} item(ns)
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="self-end sm:self-center shrink-0 flex items-center gap-2">
                          {isOverdue && (
                            <span 
                              title={`Chamado aberto há ${getHoursOpen(ticket.createdAt)}h sem atendimento!`}
                              className="p-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-400 flex items-center justify-center animate-pulse"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {getStatusBadge(ticket.status)}
                        </div>
                      </div>
                    );
                  })}
                  {tickets.length === 0 && (
                    <div className="text-center py-12 text-slate-500 text-sm">
                      Nenhum chamado registrado no sistema de produção. Clique em "Novo Chamado" para começar.
                    </div>
                  )}
                </div>
              </div>

              {/* Equipment type breakdown & Team status */}
              <div className="space-y-6">
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
                  <h3 className="font-bold text-base sm:text-lg text-white mb-4">Equipamentos & Serviços</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs sm:text-sm p-2.5 bg-slate-900 rounded-lg">
                      <span className="flex items-center gap-2"><Printer className="w-4 h-4 text-emerald-400 shrink-0" /> Impressoras & Toners</span>
                      <span className="font-mono font-semibold text-white">{tickets.filter(t => t.equipmentType === 'Impressora' || t.equipmentType === 'Troca de Toner').length}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm p-2.5 bg-slate-900 rounded-lg">
                      <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-blue-400 shrink-0" /> Relógios de Ponto</span>
                      <span className="font-mono font-semibold text-white">{tickets.filter(t => t.equipmentType === 'Relógio de Ponto').length}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm p-2.5 bg-slate-900 rounded-lg">
                      <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-indigo-400 shrink-0" /> Telefones IP</span>
                      <span className="font-mono font-semibold text-white">{tickets.filter(t => t.equipmentType === 'Telefone IP').length}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm p-2.5 bg-slate-900 rounded-lg">
                      <span className="flex items-center gap-2"><Monitor className="w-4 h-4 text-purple-400 shrink-0" /> Computadores & TI</span>
                      <span className="font-mono font-semibold text-white">{tickets.filter(t => t.equipmentType === 'Computador').length}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm p-2.5 bg-slate-900 rounded-lg">
                      <span className="flex items-center gap-2"><Globe className="w-4 h-4 text-cyan-400 shrink-0" /> Atualização do Site & Portal</span>
                      <span className="font-mono font-semibold text-white">{tickets.filter(t => t.equipmentType === 'Atualização do Site').length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
                  <h3 className="font-bold text-base sm:text-lg text-white mb-4">Setores & Secretarias</h3>
                  <div className="flex items-center justify-between p-3 bg-slate-900 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span className="text-xs sm:text-sm font-medium text-white">{departments.length} Secretarias/Setores</span>
                    </div>
                    <button onClick={() => setActiveTab('departments')} className="text-xs text-emerald-400 hover:underline">Gerenciar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Gerenciamento de Chamados</h2>
                <p className="text-xs sm:text-sm text-slate-400">Acompanhe, filtre e atualize o status dos chamados de manutenção.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
                <button 
                  onClick={() => setIsPrintModalOpen(true)}
                  className="flex-1 md:flex-initial px-3.5 py-2 text-xs font-semibold text-white bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors shadow-md flex items-center justify-center gap-1.5"
                >
                  <Print className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Imprimir Relatório</span>
                </button>
                <button 
                  onClick={() => setIsNewTicketOpen(true)}
                  className="flex-1 md:flex-initial px-3.5 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors shadow-md flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Novo Chamado</span>
                </button>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Buscar por código, título ou setor..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 flex-wrap">
                <select 
                  value={typeFilter} 
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 whitespace-nowrap"
                >
                  <option value="todos">Todos Equipamentos</option>
                  <option value="Impressora">Impressoras</option>
                  <option value="Troca de Toner">Troca de Toner</option>
                  <option value="Relógio de Ponto">Relógio de Ponto</option>
                  <option value="Telefone IP">Telefone IP</option>
                  <option value="Computador">Computadores</option>
                  <option value="Atualização do Site">Atualização do Site</option>
                  <option value="Outros">Outros</option>
                </select>

                <select 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 whitespace-nowrap"
                >
                  <option value="todos">Todos Status</option>
                  <option value="pendente_48h">⚠️ Pendentes &gt; 48h {overdueTickets48h > 0 ? `(${overdueTickets48h})` : ''}</option>
                  <option value="Aberto">Aberto</option>
                  <option value="Em Andamento">Em Andamento</option>
                  <option value="Aguardando Peças">Aguardando Peças</option>
                  <option value="Resolvido">Resolvido</option>
                  <option value="Fechado">Fechado</option>
                  <option value="Cancelado">Cancelado</option>
                  <option value="Arquivado">📁 Arquivados ({tickets.filter(t => t.archived).length})</option>
                </select>

                <select 
                  value={priorityFilter} 
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 whitespace-nowrap"
                  title="Filtrar chamados por nível de prioridade (Crítica, Alta, Média, Baixa)"
                >
                  <option value="todos">Todas Prioridades</option>
                  <option value="Crítica">🔴 Crítica ({tickets.filter(t => t.priority === 'Crítica').length})</option>
                  <option value="Alta">🟠 Alta ({tickets.filter(t => t.priority === 'Alta').length})</option>
                  <option value="Média">🟡 Média ({tickets.filter(t => t.priority === 'Média').length})</option>
                  <option value="Baixa">🟢 Baixa ({tickets.filter(t => t.priority === 'Baixa').length})</option>
                </select>

                {overdueTickets48h > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === 'pendente_48h' ? 'todos' : 'pendente_48h')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap border shrink-0 ${
                      statusFilter === 'pendente_48h'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md'
                        : 'bg-amber-500/10 text-amber-300 border-amber-400/60 hover:bg-amber-500/20'
                    }`}
                    title="Filtrar chamados abertos há mais de 48 horas"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{overdueTickets48h} pendente(s) há +48h</span>
                  </button>
                )}

                {(statusFilter !== 'todos' || typeFilter !== 'todos' || priorityFilter !== 'todos' || searchQuery !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('todos');
                      setTypeFilter('todos');
                      setPriorityFilter('todos');
                      setSearchQuery('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap border border-slate-800"
                    title="Limpar todos os filtros ativos"
                  >
                    ✕ Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Tickets Table / Cards */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-sm w-full max-w-full">
              {/* Mobile Card List (displayed on screens < md) */}
              <div className="md:hidden divide-y divide-slate-800/80">
                {filteredTickets.map(ticket => {
                  const tech = technicians.find(t => t.id === ticket.technicianId);
                  const isOverdue = isOverdue48h(ticket);
                  return (
                    <div 
                      key={ticket.id} 
                      className={`p-3.5 space-y-3 transition-colors ${
                        isOverdue 
                          ? 'bg-amber-500/[0.08] border-l-4 border-l-amber-400' 
                          : 'hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-emerald-400 text-xs">{ticket.code}</span>
                            {isOverdue && (
                              <span 
                                title={`Chamado em espera há mais de 48 horas (${getHoursOpen(ticket.createdAt)}h)`}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400 animate-pulse"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>+{getHoursOpen(ticket.createdAt)}h</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(ticket.createdAt).toLocaleDateString('pt-BR')} {new Date(ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {getStatusBadge(ticket.status)}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-semibold text-white text-xs sm:text-sm line-clamp-2">{ticket.title}</h4>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1 font-medium text-slate-200">
                            {getEquipmentIcon(ticket.equipmentType)}
                            <span>{ticket.equipmentType}</span>
                          </span>
                          <span>•</span>
                          <span className="text-slate-300 truncate max-w-[170px]">{ticket.department}</span>
                        </div>
                        {ticket.partsUsed && ticket.partsUsed.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-300 font-mono">
                            <Package className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="truncate max-w-[240px]" title={ticket.partsUsed.join(', ')}>
                              {ticket.partsUsed.length} item(ns): {ticket.partsUsed.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-900 gap-2 flex-wrap">
                        <span className="text-slate-400">
                          Prioridade: {getPriorityBadge(ticket.priority)}
                        </span>
                        <span className="text-slate-400 truncate max-w-[150px]">
                          Técnico: <strong className="text-slate-200">{tech ? tech.name : 'Não atribuído'}</strong>
                        </span>
                      </div>

                      {/* SLA Solution Deadline */}
                      {(() => {
                        const dl = ticket.deadline || calculateDefaultDeadline(ticket.priority, new Date(ticket.createdAt));
                        const sla = getSlaStatus(dl, ticket.status);
                        return (
                          <div className="p-2 bg-slate-900/80 rounded-lg border border-slate-800/80 flex items-center justify-between text-[11px] gap-2 flex-wrap">
                            <span className="text-slate-300 flex items-center gap-1 font-medium">
                              <Clock3 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>Previsão Solução: <strong className="text-white">{formatSlaDate(dl)}</strong></span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] border ${sla.badgeClass}`}>
                              {sla.label}
                            </span>
                          </div>
                        );
                      })()}

                      <div className="flex items-center gap-1.5 pt-1">
                        <button 
                          onClick={() => setSelectedTicket(ticket)}
                          className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-300" />
                          <span>Ver</span>
                        </button>
                        <button 
                          onClick={() => setEditingTicket(ticket)}
                          className="flex-1 py-1.5 px-2 bg-blue-950/70 hover:bg-blue-900 border border-blue-800/80 text-blue-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                          <span>Editar</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteTicket(ticket.id, ticket.code)}
                          className="py-1.5 px-3 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg text-xs font-medium flex items-center justify-center transition-colors shrink-0"
                          title="Apagar este chamado permanentemente"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                        <button 
                          onClick={() => toggleArchiveTicket(ticket.id)}
                          className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center transition-all shrink-0 border shadow-sm ${
                            ticket.archived 
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                              : (ticket.status === 'Resolvido' || ticket.status === 'Fechado')
                                ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/60 text-amber-400 ring-1 ring-amber-500/20'
                                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400'
                          }`}
                          title={ticket.archived ? "Desarquivar (voltar para lista principal)" : "Arquivar (ocultar do dashboard e gerenciamento)"}
                        >
                          <HardDrive className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredTickets.length === 0 && (
                  <div className="text-center py-10 px-4 text-slate-500 text-xs">
                    Nenhum chamado encontrado com os filtros atuais.
                  </div>
                )}
              </div>

              {/* Desktop Table View (displayed on md screens and up) */}
              <div className="hidden md:block overflow-x-auto w-full max-w-full">
                <table className="w-full text-left text-xs sm:text-sm min-w-[700px]">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 font-semibold">Código / Data</th>
                      <th className="px-4 sm:px-6 py-3 font-semibold">Equipamento / Setor</th>
                      <th className="px-4 sm:px-6 py-3 font-semibold">Título</th>
                      <th className="px-4 sm:px-6 py-3 font-semibold">Prioridade</th>
                      <th className="px-4 sm:px-6 py-3 font-semibold">Previsão Solução (SLA)</th>
                      <th className="px-4 sm:px-6 py-3 font-semibold">Técnico Responsável</th>
                      <th className="px-4 sm:px-6 py-3 font-semibold">Status</th>
                      <th className="px-4 sm:px-6 py-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredTickets.map(ticket => {
                      const tech = technicians.find(t => t.id === ticket.technicianId);
                      const isOverdue = isOverdue48h(ticket);
                      return (
                        <tr 
                          key={ticket.id} 
                          className={`transition-colors ${
                            isOverdue 
                              ? 'bg-amber-500/[0.08] hover:bg-amber-500/[0.14] border-l-4 border-l-amber-400' 
                              : 'hover:bg-slate-900/60'
                          }`}
                        >
                          <td className="px-4 sm:px-6 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-emerald-400">{ticket.code}</span>
                              {isOverdue && (
                                <span 
                                  title={`Chamado com status 'Aberto' há mais de 48 horas (${getHoursOpen(ticket.createdAt)}h em espera)`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400 animate-pulse"
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>+{getHoursOpen(ticket.createdAt)}h</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{new Date(ticket.createdAt).toLocaleDateString('pt-BR')} {new Date(ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5">
                            <div className="flex items-center gap-2 font-medium text-white">
                              {getEquipmentIcon(ticket.equipmentType)}
                              <span>{ticket.equipmentType}</span>
                            </div>
                            <div className="text-[11px] text-slate-400">{ticket.department}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5">
                            <div className="font-semibold text-white max-w-[200px] sm:max-w-xs truncate">{ticket.title}</div>
                            <div className="text-[11px] text-slate-400 max-w-[200px] sm:max-w-xs truncate">{ticket.description}</div>
                            {ticket.partsUsed && ticket.partsUsed.length > 0 && (
                              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-300 font-mono">
                                <Package className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="truncate max-w-[220px]" title={ticket.partsUsed.join(', ')}>
                                  {ticket.partsUsed.length} item(ns): {ticket.partsUsed.join(', ')}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 whitespace-nowrap">
                            {getPriorityBadge(ticket.priority)}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 whitespace-nowrap">
                            {(() => {
                              const dl = ticket.deadline || calculateDefaultDeadline(ticket.priority, new Date(ticket.createdAt));
                              const sla = getSlaStatus(dl, ticket.status);
                              return (
                                <div>
                                  <div className="flex items-center gap-1.5 text-xs text-slate-200 font-medium">
                                    <Clock3 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                    <span>{formatSlaDate(dl)}</span>
                                  </div>
                                  <div className="mt-0.5">
                                    <span className={`px-2 py-0.5 rounded text-[10px] border ${sla.badgeClass}`}>
                                      {sla.label}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 whitespace-nowrap">
                            <div className="text-xs font-medium text-white">{tech ? tech.name : <span className="text-amber-500 italic">Não atribuído</span>}</div>
                            <div className="text-[10px] text-slate-400">{tech ? `${tech.type}${tech.company ? ' (' + tech.company + ')' : ''}` : ''}</div>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {getStatusBadge(ticket.status)}
                              {isOverdue && (
                                <span 
                                  title={`Atenção: Aberto há mais de 48 horas (${getHoursOpen(ticket.createdAt)}h sem atendimento)`} 
                                  className="p-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-400 flex items-center justify-center animate-pulse"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-3.5 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => setSelectedTicket(ticket)}
                                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                                title="Ver ficha e histórico do chamado"
                              >
                                <Eye className="w-3.5 h-3.5 shrink-0 text-slate-300" /> 
                                <span className="hidden xl:inline">Detalhes</span>
                              </button>
                              <button 
                                onClick={() => setEditingTicket(ticket)}
                                className="px-2.5 py-1.5 bg-blue-950/70 hover:bg-blue-900 border border-blue-800/80 text-blue-300 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                                title="Editar qualquer dado deste chamado"
                              >
                                <Edit3 className="w-3.5 h-3.5 shrink-0 text-blue-400" /> 
                                <span className="hidden xl:inline">Editar</span>
                              </button>
                              <button 
                                onClick={() => handleDeleteTicket(ticket.id, ticket.code)}
                                className="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg text-xs font-medium transition-colors inline-flex items-center"
                                title="Apagar este chamado permanentemente"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                              </button>
                              <button 
                                onClick={() => toggleArchiveTicket(ticket.id)}
                                className={`p-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center border shadow-sm ${
                                  ticket.archived 
                                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                                    : (ticket.status === 'Resolvido' || ticket.status === 'Fechado')
                                      ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/60 text-amber-400 ring-1 ring-amber-500/20'
                                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-400'
                                }`}
                                title={ticket.archived ? "Desarquivar" : "Arquivar (ocultar)"}
                              >
                                <HardDrive className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredTickets.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-500 text-xs sm:text-sm">
                          Nenhum chamado registrado no sistema. Clique em "Novo Chamado" acima para criar o primeiro registro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'equipment' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Inventário de Equipamentos</h2>
                <p className="text-xs sm:text-sm text-slate-400">Cadastro de impressoras, relógios de ponto, telefones IP e computadores da prefeitura.</p>
              </div>
              <button 
                onClick={() => setIsNewEqOpen(true)}
                className="w-full md:w-auto px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Cadastrar Equipamento
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {equipment.map(eq => (
                <div key={eq.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 sm:p-2.5 bg-slate-900 rounded-xl border border-slate-800 shrink-0">
                        {getEquipmentIcon(eq.type)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-white text-sm sm:text-base truncate">{eq.name}</h3>
                        <span className="text-[11px] sm:text-xs text-emerald-400 font-mono">{eq.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 text-[11px] font-semibold rounded shrink-0 ${eq.status === 'Operacional' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>
                        {eq.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteEquipment(eq.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-900 transition-colors"
                        title="Remover equipamento do inventário"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 pt-2 border-t border-slate-900 text-slate-300">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Modelo:</span>
                      <span className="font-medium text-white text-right truncate">{eq.model}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Nº de Série:</span>
                      <span className="font-mono text-slate-200 text-right truncate">{eq.serialNumber}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Setor / Secretaria:</span>
                      <span className="font-medium text-white text-right truncate">{eq.department}</span>
                    </div>
                    {eq.ipAddress && (
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 shrink-0">Endereço IP:</span>
                        <span className="font-mono text-emerald-300 text-right truncate">{eq.ipAddress}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {equipment.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 text-sm">
                  Nenhum equipamento cadastrado. Clique em "Cadastrar Equipamento" para adicionar ativos ao inventário.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'departments' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Cadastro de Setores e Secretarias</h2>
                <p className="text-xs sm:text-sm text-slate-400">Gerencie as secretarias, departamentos e locais da Prefeitura de Guaranésia.</p>
              </div>
              <button 
                onClick={() => setIsNewDeptOpen(true)}
                className="w-full md:w-auto px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Nova Secretaria / Setor
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortDepartments(departments).map((dept, index) => {
                const eqCount = equipment.filter(e => e.department === dept).length;
                const ticketCount = tickets.filter(t => t.department === dept).length;
                return (
                  <div key={index} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-emerald-400 shrink-0">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-white text-sm sm:text-base truncate">{dept}</h3>
                          <span className="text-[11px] text-slate-400">Prefeitura Municipal</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => setEditingDept({ oldName: dept, newName: dept })}
                          className="text-slate-400 hover:text-blue-400 p-1.5 rounded-lg hover:bg-slate-900 transition-colors"
                          title="Editar/Renomear secretaria ou setor"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setDeptToDelete(dept)}
                          className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-900 transition-colors"
                          title="Remover secretaria ou setor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-900 grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-900 p-2.5 rounded-xl">
                        <div className="text-slate-400">Equipamentos</div>
                        <div className="font-mono font-bold text-white text-sm mt-0.5">{eqCount}</div>
                      </div>
                      <div className="bg-slate-900 p-2.5 rounded-xl">
                        <div className="text-slate-400">Chamados</div>
                        <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">{ticketCount}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'technicians' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Técnicos & Prestadores Terceirizados</h2>
                <p className="text-xs sm:text-sm text-slate-400">Gerencie funcionários internos e empresas terceirizadas responsáveis pelos atendimentos.</p>
              </div>
              <button 
                onClick={() => setIsNewTechOpen(true)}
                className="w-full md:w-auto px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Cadastrar Técnico / Terceirizado
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {technicians.map(tc => {
                const assignedCount = tickets.filter(t => t.technicianId === tc.id).length;
                return (
                  <div key={tc.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-white text-sm sm:text-base truncate">{tc.name}</h3>
                        <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">{tc.specialty}</div>
                        {tc.username && (
                          <div className="text-[11px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
                            <span>🔑 @{tc.username}</span>
                            {tc.password && <span className="text-slate-500">• Senha ativa</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded-md shrink-0 ${tc.type === 'Interno' ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-purple-950 text-purple-300 border border-purple-800'}`}>
                          {tc.type} {tc.company ? `• ${tc.company}` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingTechnician(tc)}
                          className="text-slate-400 hover:text-blue-400 p-1 rounded hover:bg-slate-900 transition-colors"
                          title="Editar dados, usuário e senha"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTechnician(tc.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-slate-900 transition-colors"
                          title="Remover técnico/empresa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-900">
                      <div className="flex items-center gap-2 truncate">
                        <PhoneCall className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{tc.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{tc.email}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-900 flex justify-between items-center text-xs gap-2">
                      <span className="text-slate-400">Chamados vinculados: <strong className="font-mono text-emerald-400">{assignedCount}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          setPrintTechId(tc.id);
                          setIsPrintModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Imprimir relatório com os chamados deste técnico"
                      >
                        <Print className="w-3.5 h-3.5 shrink-0" />
                        <span>Imprimir Relatório</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {technicians.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-500 text-sm">
                  Nenhum técnico cadastrado. Clique em "Cadastrar Técnico / Terceirizado" para adicionar funcionários ou empresas.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Print Report Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Print className="w-5 h-5 text-emerald-400 shrink-0" />
                <h3 className="font-bold text-sm sm:text-lg text-white truncate">Imprimir Relatório de Chamados</h3>
              </div>
              <button onClick={() => setIsPrintModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <div className="p-4 sm:p-6 space-y-6 flex-1">
              {printSingleTicketId && (
                <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-3.5 flex items-center justify-between text-xs text-emerald-300 gap-2 flex-wrap">
                  <span>Modo de Ficha Individual Ativo (Exibindo apenas o chamado selecionado).</span>
                  <button
                    type="button"
                    onClick={() => setPrintSingleTicketId(null)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Ver Todos os Chamados
                  </button>
                </div>
              )}

              {/* Filter controls for printing */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Técnico / Terceirizado</label>
                  <select 
                    value={printTechId} 
                    onChange={(e) => setPrintTechId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todos os Técnicos</option>
                    {technicians.map(tc => (
                      <option key={tc.id} value={tc.id}>{tc.name} ({tc.type})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Status</label>
                  <select 
                    value={printStatus} 
                    onChange={(e) => setPrintStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todos os Status</option>
                    <option value="Aberto">Aberto</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Aguardando Peças">Aguardando Peças</option>
                    <option value="Resolvido">Resolvido</option>
                    <option value="Fechado">Fechado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Equipamento / Serviço</label>
                  <select 
                    value={printType} 
                    onChange={(e) => setPrintType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todos os Tipos</option>
                    <option value="Impressora">Impressora</option>
                    <option value="Troca de Toner">Troca de Toner</option>
                    <option value="Relógio de Ponto">Relógio de Ponto</option>
                    <option value="Telefone IP">Telefone IP</option>
                    <option value="Computador">Computador</option>
                    <option value="Atualização do Site">Atualização do Site</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Secretaria / Setor</label>
                  <select 
                    value={printDept} 
                    onChange={(e) => setPrintDept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todas as Secretarias</option>
                    {sortDepartments(departments).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Data Inicial</label>
                  <input 
                    type="date"
                    value={printStartDate}
                    onChange={(e) => setPrintStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Data Final</label>
                  <input 
                    type="date"
                    value={printEndDate}
                    onChange={(e) => setPrintEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Daily Service Ticket Selection (Folha de Atendimentos do Dia) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 no-print">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="onlyDailyToggle"
                      checked={onlyPrintSelectedDaily}
                      onChange={(e) => setOnlyPrintSelectedDaily(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-950 cursor-pointer"
                    />
                    <label htmlFor="onlyDailyToggle" className="text-xs sm:text-sm font-bold text-white cursor-pointer">
                      Folha de Atendimentos do Dia (Imprimir apenas os chamados selecionados abaixo)
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const allMatchingIds = tickets.filter(t => !t.archived).map(t => t.id);
                        setSelectedDailyTicketIds(allMatchingIds);
                        setOnlyPrintSelectedDaily(true);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-semibold"
                    >
                      Selecionar Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDailyTicketIds([]);
                        setOnlyPrintSelectedDaily(false);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-semibold"
                    >
                      Limpar Seleção
                    </button>
                  </div>
                </div>

                {/* Ticket Checkboxes List for Selection */}
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-slate-800 bg-slate-950 p-2.5 rounded-lg">
                  {tickets.filter(t => !t.archived).map(t => {
                    const isSelected = selectedDailyTicketIds.includes(t.id);
                    return (
                      <label 
                        key={t.id} 
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-emerald-950/40 border-emerald-500/60 text-white' 
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDailyTicketIds(prev => [...prev, t.id]);
                                setOnlyPrintSelectedDaily(true);
                              } else {
                                setSelectedDailyTicketIds(prev => prev.filter(id => id !== t.id));
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-950 shrink-0 cursor-pointer"
                          />
                          <span className="font-mono font-bold text-emerald-400 shrink-0">[{t.code}]</span>
                          <span className="font-medium truncate">{t.title}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">({t.department})</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          t.status === 'Resolvido' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/60 text-amber-300'
                        }`}>
                          {t.status}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Printable Preview Area */}
              <div className="printable-document bg-white text-slate-950 rounded-xl p-6 sm:p-10 shadow-2xl border-2 border-slate-900 space-y-6 print:p-0 print:border-none print:shadow-none">
                {/* Municipal Letterhead Header */}
                <div className="text-center border-b-2 border-slate-900 pb-5 space-y-1">
                  <div className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
                    Prefeitura Municipal de Guaranésia - MG
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
                    Secretaria Municipal de Administração • Departamento de TI & Manutenção
                  </div>
                  <div className="text-base sm:text-lg font-black uppercase tracking-wide text-emerald-950 pt-2 border-t border-slate-300 mt-2 inline-block px-4">
                    {printSingleTicketId ? 'ORDEM DE SERVIÇO DE MANUTENÇÃO (O.S.)' : 'RELATÓRIO DE CHAMADOS E ORDENS DE SERVIÇO'}
                  </div>
                  <div className="text-xs text-slate-600 font-medium">
                    Data de Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} | Registros: {printableTickets.length}
                  </div>
                </div>

                {/* Printable Content: Single Work Order vs General Report */}
                {printSingleTicketId && printableTickets.length === 1 ? (
                  /* Single Ticket Work Order (OS Individual) */
                  (() => {
                    const ticket = printableTickets[0];
                    const tech = technicians.find(tc => tc.id === ticket.technicianId);
                    const deadline = ticket.deadline || calculateDefaultDeadline(ticket.priority, new Date(ticket.createdAt));
                    const sla = getSlaStatus(deadline, ticket.status);
                    return (
                      <div className="printable-card space-y-6 text-sm sm:text-base text-black font-sans leading-relaxed">
                        {/* OS Header Number */}
                        <div className="flex justify-between items-center bg-slate-100 p-4 border-2 border-slate-900 rounded-lg">
                          <div>
                            <span className="text-xs font-bold uppercase text-slate-600 block">Número da Ordem de Serviço</span>
                            <span className="text-xl sm:text-2xl font-black font-mono text-black">{ticket.code}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold uppercase text-slate-600 block">Status do Atendimento</span>
                            <span className="text-sm sm:text-base font-bold px-3 py-1 bg-white border border-slate-900 rounded text-black uppercase">
                              {ticket.status}
                            </span>
                          </div>
                        </div>

                        {/* Requester & Sector Box */}
                        <div className="border-2 border-slate-900 rounded-lg p-4 space-y-3">
                          <h4 className="text-sm font-black uppercase tracking-wider text-black border-b border-slate-900 pb-1">
                            1. Dados do Solicitante & Setor
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div><strong>Secretaria / Setor:</strong> <span className="font-semibold">{ticket.department}</span></div>
                            <div><strong>Servidor Solicitante:</strong> <span className="font-semibold">{ticket.requesterName || 'Não informado'}</span></div>
                            <div><strong>Contato / WhatsApp:</strong> <span className="font-semibold">{ticket.requesterContact || 'Não informado'}</span></div>
                            <div><strong>Data de Abertura:</strong> <span className="font-semibold">{new Date(ticket.createdAt).toLocaleString('pt-BR')}</span></div>
                          </div>
                        </div>

                        {/* Service Demand & SLA Box */}
                        <div className="border-2 border-slate-900 rounded-lg p-4 space-y-3">
                          <h4 className="text-sm font-black uppercase tracking-wider text-black border-b border-slate-900 pb-1">
                            2. Equipamento & Prazo Previsto (SLA)
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                            <div><strong>Serviço / Equipamento:</strong> <span className="font-semibold">{ticket.equipmentType}</span></div>
                            <div><strong>Prioridade:</strong> <span className="font-bold">{ticket.priority}</span></div>
                            <div className="bg-slate-100 p-2 border border-slate-900 rounded">
                              <strong>Data Prevista de Solução (SLA):</strong>
                              <div className="font-black text-base font-mono mt-0.5">{formatSlaDate(deadline)}</div>
                              <div className="text-xs font-semibold text-slate-700">Situacão SLA: {sla.label}</div>
                            </div>
                          </div>
                          <div className="pt-2">
                            <strong>Descrição do Problema:</strong>
                            <p className="p-3 bg-slate-50 border border-slate-400 rounded mt-1 font-medium text-slate-900">
                              {ticket.description}
                            </p>
                          </div>
                        </div>

                        {/* Technical Execution Box */}
                        <div className="border-2 border-slate-900 rounded-lg p-4 space-y-3">
                          <h4 className="text-sm font-black uppercase tracking-wider text-black border-b border-slate-900 pb-1">
                            3. Execução Técnica & Peças Utilizadas
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div><strong>Técnico Responsável:</strong> <span className="font-bold">{tech ? `${tech.name} (${tech.type})` : 'Não atribuído'}</span></div>
                            <div><strong>Empresa / Prestador:</strong> <span className="font-semibold">{tech?.company || 'Prefeitura Municipal'}</span></div>
                          </div>

                          {ticket.resolutionNotes && (
                            <div className="pt-1">
                              <strong>Laudo Técnico / Observações de Resolução:</strong>
                              <p className="p-2.5 bg-slate-50 border border-slate-300 rounded mt-1 text-sm font-medium">
                                {ticket.resolutionNotes}
                              </p>
                            </div>
                          )}

                          <div>
                            <strong>Peças / Materiais Aplicados:</strong>
                            {ticket.partsUsed && ticket.partsUsed.length > 0 ? (
                              <div className="flex flex-wrap gap-2 mt-1.5">
                                {ticket.partsUsed.map((p, pIdx) => (
                                  <span key={pIdx} className="px-3 py-1 bg-slate-200 border border-slate-900 text-black font-bold text-xs rounded">
                                    ✓ {p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-600 italic block mt-1">Nenhum material registrado.</span>
                            )}
                          </div>
                        </div>

                        {/* Signature Block */}
                        <div className="pt-8 border-t-2 border-slate-900 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center text-xs sm:text-sm font-bold">
                          <div className="space-y-12">
                            <div className="border-b-2 border-black w-3/4 mx-auto"></div>
                            <div>
                              <div>TÉCNICO RESPONSÁVEL</div>
                              <div className="text-slate-600 font-normal">{tech ? tech.name : 'Assinatura do Técnico'}</div>
                            </div>
                          </div>
                          <div className="space-y-12">
                            <div className="border-b-2 border-black w-3/4 mx-auto"></div>
                            <div>
                              <div>RESPONSÁVEL PELO SETOR</div>
                              <div className="text-slate-600 font-normal">{ticket.department}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  /* General Maintenance Tickets List Report */
                  <div className="space-y-6">
                    {/* KPI Totals Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs sm:text-sm font-bold bg-slate-100 p-3.5 border-2 border-slate-900 rounded-lg">
                      <div className="border-r border-slate-300 pr-2">
                        <span className="text-slate-600 text-xs block font-normal">Total Chamados</span>
                        <span className="text-base sm:text-lg font-black">{printableTickets.length}</span>
                      </div>
                      <div className="border-r border-slate-300 pr-2">
                        <span className="text-slate-600 text-xs block font-normal">Resolvidos / Concluídos</span>
                        <span className="text-base sm:text-lg font-black text-emerald-800">
                          {printableTickets.filter(t => t.status === 'Resolvido' || t.status === 'Fechado').length}
                        </span>
                      </div>
                      <div className="border-r border-slate-300 pr-2">
                        <span className="text-slate-600 text-xs block font-normal">Em Andamento / Aberto</span>
                        <span className="text-base sm:text-lg font-black text-blue-800">
                          {printableTickets.filter(t => t.status === 'Aberto' || t.status === 'Em Andamento' || t.status === 'Aguardando Peças').length}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 text-xs block font-normal">Prazos Vencidos</span>
                        <span className="text-base sm:text-lg font-black text-rose-800">
                          {printableTickets.filter(t => {
                            const dl = t.deadline || calculateDefaultDeadline(t.priority, new Date(t.createdAt));
                            return getSlaStatus(dl, t.status).type === 'overdue';
                          }).length}
                        </span>
                      </div>
                    </div>

                    {/* Table / Cards List */}
                    <div className="space-y-4">
                      {printableTickets.map((t, i) => {
                        const tech = technicians.find(tc => tc.id === t.technicianId);
                        const deadline = t.deadline || calculateDefaultDeadline(t.priority, new Date(t.createdAt));
                        const sla = getSlaStatus(deadline, t.status);

                        return (
                          <div key={t.id} className="printable-card border-2 border-slate-900 rounded-lg p-4 text-xs sm:text-sm space-y-2.5 break-inside-avoid">
                            <div className="flex justify-between items-center font-bold border-b border-slate-300 pb-2 gap-2 flex-wrap">
                              <span className="text-base font-black">
                                {i + 1}. [{t.code}] {t.title}
                              </span>
                              <span className="px-3 py-1 bg-slate-200 border border-slate-900 rounded font-black uppercase text-xs">
                                {t.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-800 text-xs sm:text-sm pt-1">
                              <div><strong>Abertura:</strong> {new Date(t.createdAt).toLocaleDateString('pt-BR')} {new Date(t.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                              <div><strong>Setor:</strong> {t.department}</div>
                              <div><strong>Equipamento:</strong> {t.equipmentType}</div>
                              <div><strong>Técnico:</strong> {tech ? `${tech.name} (${tech.type})` : 'Não atribuído'}</div>
                            </div>

                            <div className="bg-slate-100 p-2 border border-slate-300 rounded flex justify-between items-center flex-wrap gap-2 text-xs sm:text-sm font-medium">
                              <span><strong>Data Prevista para Solução (SLA):</strong> <strong className="font-mono text-black font-bold">{formatSlaDate(deadline)}</strong></span>
                              <span className="font-bold border px-2 py-0.5 rounded bg-white">{sla.label}</span>
                            </div>

                            <div className="text-slate-900 text-xs sm:text-sm">
                              <strong>Descrição do Problema:</strong> {t.description}
                            </div>

                            {t.partsUsed && t.partsUsed.length > 0 && (
                              <div className="bg-emerald-50 p-2 rounded border border-emerald-300 text-emerald-950 text-xs sm:text-sm font-semibold">
                                <strong>Peças / Materiais Utilizados:</strong> {t.partsUsed.join(', ')}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {printableTickets.length === 0 && (
                        <div className="text-center py-12 text-slate-500 font-medium">
                          Nenhum chamado encontrado com os filtros de impressão selecionados.
                        </div>
                      )}
                    </div>

                    {/* Report Sign-off Footer */}
                    <div className="pt-10 border-t-2 border-slate-900 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center text-xs sm:text-sm font-bold">
                      <div className="space-y-12">
                        <div className="border-b-2 border-black w-3/4 mx-auto"></div>
                        <div>RESPONSÁVEL PELA IMPRESSÃO / TI</div>
                      </div>
                      <div className="space-y-12">
                        <div className="border-b-2 border-black w-3/4 mx-auto"></div>
                        <div>SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row justify-between items-center gap-3 sticky bottom-0 z-10">
              <span className="text-xs text-slate-400">Mostrando {printableTickets.length} chamado(s) com os filtros atuais</span>
              <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
                <button 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs hover:bg-slate-700"
                >
                  Fechar
                </button>
                <button 
                  onClick={handleExportCSV}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                  title="Exportar os chamados filtrados atuais para planilha CSV (Excel / Sheets / Calc)"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>Exportar CSV (Planilha)</span>
                </button>
                <button 
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-emerald-400 flex items-center justify-center gap-2"
                >
                  <Print className="w-4 h-4 shrink-0" />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 bg-slate-950 z-10">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
                <span className="font-mono text-base sm:text-lg font-bold text-emerald-400">{selectedTicket.code}</span>
                {getStatusBadge(selectedTicket.status)}
                {isOverdue48h(selectedTicket) && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400 shadow-sm animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>+{getHoursOpen(selectedTicket.createdAt)}h</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => setEditingTicket(selectedTicket)}
                  className="px-2.5 py-1.5 bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 text-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Editar qualquer campo deste chamado"
                >
                  <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTicket(selectedTicket.id, selectedTicket.code)}
                  className="px-2.5 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Apagar este chamado permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Apagar</span>
                </button>
                <button 
                  onClick={() => setSelectedTicket(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 hover:bg-slate-800 ml-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-6 flex-1">
              {/* Overdue alert banner if open > 48h */}
              {isOverdue48h(selectedTicket) && (
                <div className="bg-amber-500/10 border-2 border-amber-400 rounded-xl p-3.5 sm:p-4 flex items-start gap-3 text-amber-200 shadow-md">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-amber-300 uppercase tracking-wide">
                      Alerta: Chamado Aberto há mais de 48 Horas ({getHoursOpen(selectedTicket.createdAt)} horas pendente)
                    </h4>
                    <p className="text-xs text-amber-200/90 mt-0.5 leading-relaxed">
                      Este chamado foi aberto há mais de 2 dias e ainda não teve sua execução concluída. Recomendamos atribuir um técnico ou atualizar o status para evitar atrasos no setor municipal ({selectedTicket.department}).
                    </p>
                  </div>
                </div>
              )}

              {/* Header info */}
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white">{selectedTicket.title}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-2">
                  <span>Secretaria/Setor: <strong className="text-white">{selectedTicket.department}</strong></span>
                  <span>Equipamento: <strong className="text-white">{selectedTicket.equipmentType}</strong></span>
                  <span>Prioridade: {getPriorityBadge(selectedTicket.priority)}</span>
                  <span>Abertura: <strong className="text-white">{new Date(selectedTicket.createdAt).toLocaleString('pt-BR')}</strong></span>
                </div>
              </div>

              {/* SLA Resolution Deadline Card */}
              {(() => {
                const dl = selectedTicket.deadline || calculateDefaultDeadline(selectedTicket.priority, new Date(selectedTicket.createdAt));
                const sla = getSlaStatus(dl, selectedTicket.status);
                return (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0">
                        <Clock3 className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Data Prevista para Solução do Problema (SLA)
                        </span>
                        <span className="text-sm sm:text-base font-bold text-white font-mono mt-0.5 block">
                          {formatSlaDate(dl)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-lg text-xs border ${sla.badgeClass}`}>
                        {sla.label}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Description */}
              <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 sm:p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Descrição do Problema</h4>
                <p className="text-xs sm:text-sm text-slate-200">{selectedTicket.description}</p>
              </div>

              {/* AI Diagnostic Insight if available */}
              {selectedTicket.aiDiagnosis && (
                <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Diagnóstico e Sugestão de IA (Gemini)</span>
                  </div>
                  <p className="text-xs text-slate-300"><strong>Causa provável:</strong> {selectedTicket.aiDiagnosis.diagnostico}</p>
                  <div>
                    <span className="text-xs font-semibold text-slate-400">Passos de Resolução Recomendados:</span>
                    <ul className="list-disc list-inside text-xs text-slate-200 mt-1 space-y-1">
                      {selectedTicket.aiDiagnosis.passosResolucao.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                  {selectedTicket.aiDiagnosis.pecasSugeridas && selectedTicket.aiDiagnosis.pecasSugeridas.length > 0 && (
                    <div className="text-xs text-emerald-300">
                      <strong>Peças / Suprimentos recomendados:</strong> {selectedTicket.aiDiagnosis.pecasSugeridas.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Assignee & Status Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-900">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Atribuir Técnico / Terceirizado</label>
                  <select 
                    value={selectedTicket.technicianId || ''}
                    onChange={(e) => assignTechnician(selectedTicket.id, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Não atribuído --</option>
                    {technicians.map(tc => (
                      <option key={tc.id} value={tc.id}>{tc.name} ({tc.type}{tc.company ? ' - ' + tc.company : ''})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Atualizar Status</label>
                  <select 
                    value={selectedTicket.status}
                    onChange={(e) => updateTicketStatus(selectedTicket.id, e.target.value as TicketStatus)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Aberto">Aberto</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Aguardando Peças">Aguardando Peças</option>
                    <option value="Resolvido">Resolvido</option>
                    <option value="Fechado">Fechado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>

                <div className="flex-1 space-y-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Visibilidade</label>
                  <button
                    onClick={() => toggleArchiveTicket(selectedTicket.id)}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${selectedTicket.archived ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>{selectedTicket.archived ? 'Desarquivar Chamado' : 'Arquivar Chamado'}</span>
                  </button>
                </div>
              </div>

              {/* Equipment and Parts Used by Technician */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        Equipamentos e Peças Utilizados no Atendimento
                        {selectedTicket.partsUsed && selectedTicket.partsUsed.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            {selectedTicket.partsUsed.length} item(ns)
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Registre switches, roteadores, toners, cabos de rede, unidades de imagem, conectores ou qualquer material aplicado.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Currently Registered Parts */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Itens Registrados Neste Chamado
                  </label>
                  {selectedTicket.partsUsed && selectedTicket.partsUsed.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedTicket.partsUsed.map((part, pIdx) => (
                        <div 
                          key={pIdx}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-emerald-500/40 text-emerald-300 text-xs font-medium group hover:border-rose-500/50 transition-colors shadow-sm"
                        >
                          <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-medium text-white">{part}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePartFromTicket(selectedTicket.id, pIdx)}
                            className="ml-1 text-slate-400 hover:text-rose-400 p-0.5 rounded hover:bg-slate-800 transition-colors"
                            title="Remover este item"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-950/70 border border-dashed border-slate-800 rounded-lg text-slate-400 text-xs flex items-center gap-2">
                      <Package className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>Nenhum equipamento ou peça registrado ainda. Adicione abaixo usando os botões rápidos ou digitando.</span>
                    </div>
                  )}
                </div>

                {/* Custom Input */}
                <div className="pt-2 border-t border-slate-800/80">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                    Adicionar Equipamento ou Peça Específico:
                  </label>
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddPartToTicket(selectedTicket.id, partInput);
                    }}
                    className="flex flex-col sm:flex-row gap-2"
                  >
                    <div className="relative flex-1">
                      <input 
                        type="text"
                        placeholder="Ex: Switch 8 portas TP-Link, Toner HP 85A, Cabo de Rede 10m, Conector RJ-45..."
                        value={partInput}
                        onChange={(e) => setPartInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!partInput.trim()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:pointer-events-none text-white font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Adicionar ao Chamado</span>
                    </button>
                  </form>
                </div>

                {/* Quick Add Presets */}
                <div>
                  <div className="text-[11px] text-slate-400 mb-2 font-medium flex items-center gap-1.5">
                    <span>⚡ Sugestões Rápidas (clique para adicionar com 1 toque):</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_PARTS_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddPartToTicket(selectedTicket.id, preset)}
                        className="text-[11px] px-2.5 py-1 bg-slate-950 hover:bg-slate-800 hover:border-emerald-500/50 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-all flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3 text-emerald-400" />
                        <span>{preset}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Add Note Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 sm:p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Adicionar Nova Anotação / Andamento</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] text-slate-400 mb-1">Autor / Responsável</label>
                    <input 
                      type="text" 
                      value={newNoteAuthor}
                      onChange={(e) => setNewNoteAuthor(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                      placeholder="Ex: Administrador ou Técnico"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-end">
                    <span className="text-[11px] text-slate-400">Timestamp: {new Date().toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div>
                  <textarea 
                    rows={2}
                    placeholder="Escreva a anotação, peças trocadas ou observação do atendimento..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button 
                    type="button"
                    onClick={() => handleAddNoteToTicket(selectedTicket.id)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" /> Adicionar Anotação
                  </button>
                </div>
              </div>

              {/* Timeline / Notes */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Histórico de Intervenções</h4>
                <div className="space-y-3">
                  {selectedTicket.notes.map(note => (
                    <div key={note.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs">
                      <div className="flex justify-between items-center text-slate-400 mb-1 gap-2 flex-wrap">
                        <strong className="text-white">{note.author}</strong>
                        <span className="font-mono text-[11px]">{new Date(note.timestamp).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-slate-300">{note.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
                <button 
                  type="button"
                  onClick={() => {
                    setPrintSingleTicketId(selectedTicket.id);
                    setIsPrintModalOpen(true);
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                  title="Imprimir ficha completa deste chamado individual"
                >
                  <Print className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>Imprimir Este Chamado</span>
                </button>
                <button 
                  onClick={() => {
                    const text = `*[Prefeitura de Guaranésia - Chamado ${selectedTicket.code}]*\n*Equipamento:* ${selectedTicket.equipmentType}\n*Secretaria/Setor:* ${selectedTicket.department}\n*Problema:* ${selectedTicket.title}\n*Status:* ${selectedTicket.status}\n*Prioridade:* ${selectedTicket.priority}`;
                    navigator.clipboard.writeText(text);
                    alert('Resumo do chamado copiado para a área de transferência! Pronto para colar no WhatsApp.');
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Share2 className="w-4 h-4 shrink-0" /> Copiar para WhatsApp
                </button>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                <button 
                  type="button"
                  onClick={() => setEditingTicket(selectedTicket)}
                  className="px-3.5 py-2 bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 text-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Editar qualquer campo deste chamado"
                >
                  <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Editar Dados</span>
                </button>
                <button 
                  type="button"
                  onClick={() => handleDeleteTicket(selectedTicket.id, selectedTicket.code)}
                  className="px-3 py-2 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Apagar este chamado permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Excluir</span>
                </button>
                <button 
                  onClick={() => setSelectedTicket(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ticket Modal (Full Customization of Any Field) */}
      {editingTicket && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                  <Edit3 className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-lg text-white flex items-center gap-2 flex-wrap">
                    <span>Editar Chamado:</span>
                    <span className="font-mono text-emerald-400">{editingTicket.code}</span>
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 line-clamp-1">Modifique qualquer informação, técnico, status ou prioridade</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingTicket(null)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 hover:bg-slate-800 shrink-0"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditedTicket} className="p-3.5 sm:p-6 space-y-4 flex-1">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Título do Problema / Assunto <span className="text-rose-400">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={editingTicket.title}
                  onChange={(e) => setEditingTicket({ ...editingTicket, title: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Status & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Status do Chamado
                  </label>
                  <select 
                    value={editingTicket.status}
                    onChange={(e) => setEditingTicket({ ...editingTicket, status: e.target.value as TicketStatus })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-semibold"
                  >
                    <option value="Aberto">Aberto</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Aguardando Peças">Aguardando Peças</option>
                    <option value="Resolvido">Resolvido 🎉</option>
                    <option value="Fechado">Fechado 🎉</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Prioridade
                  </label>
                  <select 
                    value={editingTicket.priority}
                    onChange={(e) => {
                      const newP = e.target.value as Priority;
                      setEditingTicket({ 
                        ...editingTicket, 
                        priority: newP,
                        deadline: calculateDefaultDeadline(newP, new Date(editingTicket.createdAt))
                      });
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Crítica">Crítica</option>
                  </select>
                </div>
              </div>

              {/* Data Prevista para Solução do Problema (SLA) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-2">
                <label className="block text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock3 className="w-4 h-4 text-cyan-400" />
                  <span>Data Prevista para Solução do Problema (SLA)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                  <input 
                    type="datetime-local"
                    value={isoToDatetimeLocal(editingTicket.deadline || calculateDefaultDeadline(editingTicket.priority, new Date(editingTicket.createdAt)))}
                    onChange={(e) => setEditingTicket({
                      ...editingTicket,
                      deadline: e.target.value ? new Date(e.target.value).toISOString() : undefined
                    })}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 24);
                        setEditingTicket({ ...editingTicket, deadline: d.toISOString() });
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +24h
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 48);
                        setEditingTicket({ ...editingTicket, deadline: d.toISOString() });
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +48h
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 72);
                        setEditingTicket({ ...editingTicket, deadline: d.toISOString() });
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +72h
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        setEditingTicket({ ...editingTicket, deadline: d.toISOString() });
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +7d
                    </button>
                  </div>
                </div>
              </div>

              {/* Equipment Type & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tipo de Equipamento / Serviço
                  </label>
                  <select 
                    value={editingTicket.equipmentType}
                    onChange={(e) => setEditingTicket({ ...editingTicket, equipmentType: e.target.value as EquipmentType })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Impressora">Impressora</option>
                    <option value="Troca de Toner">Troca de Toner</option>
                    <option value="Relógio de Ponto">Relógio de Ponto</option>
                    <option value="Telefone IP">Telefone IP</option>
                    <option value="Computador">Computador</option>
                    <option value="Atualização do Site">Atualização do Site (Portal / Diário / Notícias)</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Secretaria / Setor Solicitante
                  </label>
                  <select 
                    value={editingTicket.department}
                    onChange={(e) => setEditingTicket({ ...editingTicket, department: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {sortDepartments(departments).map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Assigned Technician & Linked Equipment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Técnico / Terceirizado Responsável
                  </label>
                  <select 
                    value={editingTicket.technicianId || ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, technicianId: e.target.value || undefined })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Não atribuído --</option>
                    {technicians.map(tc => (
                      <option key={tc.id} value={tc.id}>{tc.name} ({tc.type}{tc.company ? ' - ' + tc.company : ''})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Equipamento Cadastrado Vinculado (Opcional)
                  </label>
                  <select 
                    value={editingTicket.equipmentId || ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, equipmentId: e.target.value || undefined })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Nenhum específico --</option>
                    {equipment.map(eq => (
                      <option key={eq.id} value={eq.id}>{eq.name} ({eq.department})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Requester Name & Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome do Solicitante
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: Carlos ou Maria"
                    value={editingTicket.requesterName || ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, requesterName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    WhatsApp / Telefone do Solicitante
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: (35) 99876-5432"
                    value={editingTicket.requesterContact || ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, requesterContact: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Descrição Detalhada do Problema <span className="text-rose-400">*</span>
                </label>
                <textarea 
                  required
                  rows={3}
                  value={editingTicket.description}
                  onChange={(e) => setEditingTicket({ ...editingTicket, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Resolution Notes & Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Observações de Resolução / Laudo Técnico (Opcional)
                  </label>
                  <input 
                    type="text"
                    placeholder="Ex: Toner substituído e testes realizados com sucesso."
                    value={editingTicket.resolutionNotes || ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, resolutionNotes: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Custo Total (R$)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={editingTicket.cost !== undefined ? editingTicket.cost : ''}
                    onChange={(e) => setEditingTicket({ ...editingTicket, cost: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-800">
                <button 
                  type="button"
                  onClick={() => handleDeleteTicket(editingTicket.id, editingTicket.code)}
                  className="w-full sm:w-auto px-4 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Excluir Este Chamado</span>
                </button>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <button 
                    type="button"
                    onClick={() => setEditingTicket(null)}
                    className="px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Alterações</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      {isNewTicketOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <h3 className="font-bold text-sm sm:text-lg text-white truncate">Novo Chamado de Manutenção</h3>
              <button onClick={() => setIsNewTicketOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <form onSubmit={handleCreateTicket} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Título do Problema / Serviço</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Impressora emperrando papel ou Troca de Toner Preto"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo de Equipamento / Serviço</label>
                  <select 
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as EquipmentType)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Impressora">Impressora</option>
                    <option value="Troca de Toner">Troca de Toner</option>
                    <option value="Relógio de Ponto">Relógio de Ponto</option>
                    <option value="Telefone IP">Telefone IP</option>
                    <option value="Computador">Computador</option>
                    <option value="Atualização do Site">Atualização do Site (Portal / Diário / Notícias)</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Secretaria / Setor</label>
                  <select 
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {sortDepartments(departments).map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Prioridade</label>
                  <select 
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as Priority)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Crítica">Crítica</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Atribuir Técnico / Terceirizado</label>
                  <select 
                    value={newTechId}
                    onChange={(e) => setNewTechId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Atribuir depois --</option>
                    {technicians.map(tc => (
                      <option key={tc.id} value={tc.id}>{tc.name} ({tc.type})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Vincular Equipamento Cadastrado (Opcional)</label>
                <select 
                  value={newEqId}
                  onChange={(e) => setNewEqId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Nenhum específico --</option>
                  {equipment.map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.name} ({eq.department})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Descrição Detalhada do Problema</label>
                <textarea 
                  required
                  rows={3}
                  placeholder="Descreva o sintoma, código de erro ou necessidade de suprimento..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-2">
                <label className="block text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock3 className="w-4 h-4 text-cyan-400" />
                  <span>Data Prevista para Solução do Problema (SLA)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                  <input 
                    type="datetime-local"
                    value={isoToDatetimeLocal(newDeadline || calculateDefaultDeadline(newPriority))}
                    onChange={(e) => setNewDeadline(e.target.value ? new Date(e.target.value).toISOString() : '')}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 24);
                        setNewDeadline(d.toISOString());
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +24h
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 48);
                        setNewDeadline(d.toISOString());
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +48h
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 72);
                        setNewDeadline(d.toISOString());
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +72h
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        setNewDeadline(d.toISOString());
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded border border-slate-700"
                    >
                      +7d
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-900 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setIsNewTicketOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isAiAnalyzing}
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-emerald-400 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAiAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                      <span>Analisando com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>Salvar Chamado & Diagnóstico IA</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Technician Modal */}
      {isNewTechOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <h3 className="font-bold text-sm sm:text-lg text-white truncate">Cadastrar Técnico ou Terceirizado</h3>
              <button onClick={() => setIsNewTechOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <form onSubmit={handleAddTechnician} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome do Técnico / Contato</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: João da Silva ou Empresa Service"
                  value={techName}
                  onChange={(e) => setTechName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo</label>
                  <select 
                    value={techType}
                    onChange={(e) => setTechType(e.target.value as 'Interno' | 'Terceirizado')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Interno">Funcionário Interno</option>
                    <option value="Terceirizado">Empresa Terceirizada</option>
                  </select>
                </div>

                {techType === 'Terceirizado' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Nome da Empresa</label>
                    <input 
                      type="text" 
                      placeholder="Ex: TechPrint Ltda"
                      value={techCompany}
                      onChange={(e) => setTechCompany(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Especialidade</label>
                <input 
                  type="text" 
                  placeholder="Ex: Impressoras, Relógios de Ponto, Redes"
                  value={techSpecialty}
                  onChange={(e) => setTechSpecialty(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Usuário de Acesso</label>
                  <input 
                    type="text" 
                    placeholder="Ex: carlos.ti"
                    value={techUsername}
                    onChange={(e) => setTechUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Senha de Acesso</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    value={techPassword}
                    onChange={(e) => setTechPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Telefone / WhatsApp</label>
                  <input 
                    type="text" 
                    placeholder="(35) 99999-9999"
                    value={techPhone}
                    onChange={(e) => setTechPhone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">E-mail</label>
                  <input 
                    type="email" 
                    placeholder="contato@empresa.com"
                    value={techEmail}
                    onChange={(e) => setTechEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-900 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setIsNewTechOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-emerald-400 flex items-center justify-center"
                >
                  Cadastrar Técnico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Technician Modal */}
      {editingTechnician && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <h3 className="font-bold text-sm sm:text-lg text-white truncate">Editar Técnico / Credenciais</h3>
              <button onClick={() => setEditingTechnician(null)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <form onSubmit={handleSaveEditedTechnician} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome do Técnico / Contato</label>
                <input 
                  type="text" 
                  required
                  value={editingTechnician.name}
                  onChange={(e) => setEditingTechnician({ ...editingTechnician, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Usuário de Acesso</label>
                  <input 
                    type="text" 
                    placeholder="Ex: carlos.ti"
                    value={editingTechnician.username || ''}
                    onChange={(e) => setEditingTechnician({ ...editingTechnician, username: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Senha de Acesso</label>
                  <input 
                    type="text" 
                    placeholder="Nova senha ou manter"
                    value={editingTechnician.password || ''}
                    onChange={(e) => setEditingTechnician({ ...editingTechnician, password: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Especialidade</label>
                <input 
                  type="text" 
                  value={editingTechnician.specialty || ''}
                  onChange={(e) => setEditingTechnician({ ...editingTechnician, specialty: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Telefone / WhatsApp</label>
                  <input 
                    type="text" 
                    value={editingTechnician.phone || ''}
                    onChange={(e) => setEditingTechnician({ ...editingTechnician, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">E-mail</label>
                  <input 
                    type="email" 
                    value={editingTechnician.email || ''}
                    onChange={(e) => setEditingTechnician({ ...editingTechnician, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-900 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setEditingTechnician(null)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-500 flex items-center justify-center shadow"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Equipment Modal */}
      {isNewEqOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <h3 className="font-bold text-sm sm:text-lg text-white truncate">Cadastrar Equipamento / Ativo</h3>
              <button onClick={() => setIsNewEqOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <form onSubmit={handleAddEquipment} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome / Identificação do Equipamento</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: HP LaserJet M404n (Gabinete)"
                  value={eqName}
                  onChange={(e) => setEqName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tipo</label>
                  <select 
                    value={eqType}
                    onChange={(e) => setEqType(e.target.value as EquipmentType)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Impressora">Impressora</option>
                    <option value="Troca de Toner">Troca de Toner</option>
                    <option value="Relógio de Ponto">Relógio de Ponto</option>
                    <option value="Telefone IP">Telefone IP</option>
                    <option value="Computador">Computador</option>
                    <option value="Atualização do Site">Site / Portal Oficial da Prefeitura</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Secretaria / Setor</label>
                  <select 
                    value={eqDept}
                    onChange={(e) => setEqDept(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {sortDepartments(departments).map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Modelo</label>
                  <input 
                    type="text" 
                    placeholder="Ex: HP M404n"
                    value={eqModel}
                    onChange={(e) => setEqModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Nº de Série</label>
                  <input 
                    type="text" 
                    placeholder="Ex: CNB3M8821X"
                    value={eqSerial}
                    onChange={(e) => setEqSerial(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Endereço IP (Opcional)</label>
                <input 
                  type="text" 
                  placeholder="Ex: 192.168.10.15"
                  value={eqIp}
                  onChange={(e) => setEqIp(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-900 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setIsNewEqOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-emerald-400 flex items-center justify-center"
                >
                  Cadastrar Equipamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Department Modal */}
      {isNewDeptOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <h3 className="font-bold text-sm sm:text-lg text-white truncate">Cadastrar Nova Secretaria ou Setor</h3>
              <button onClick={() => setIsNewDeptOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <form onSubmit={handleAddDepartment} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome da Secretaria ou Setor</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Secretaria de Cultura e Turismo"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-900 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setIsNewDeptOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-emerald-400 flex items-center justify-center"
                >
                  Salvar Setor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Department Modal */}
      {editingDept && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Edit3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0" />
                <h3 className="font-bold text-sm sm:text-lg text-white truncate">Editar Secretaria / Setor</h3>
              </div>
              <button onClick={() => setEditingDept(null)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <form onSubmit={handleEditDepartment} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome da Secretaria ou Setor</label>
                <input 
                  type="text" 
                  required
                  value={editingDept.newName}
                  onChange={(e) => setEditingDept({ ...editingDept, newName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">Ao alterar o nome, os chamados e equipamentos vinculados serão atualizados automaticamente.</p>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-900 flex-wrap">
                <button 
                  type="button"
                  onClick={() => setEditingDept(null)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-500 flex items-center justify-center shadow"
                >
                  Salvar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Department In-App Confirmation Modal */}
      {deptToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl space-y-4 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg text-white">Remover Secretaria / Setor</h3>
                <p className="text-xs text-slate-400">Excluir do cadastro da Prefeitura</p>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl text-xs space-y-2">
              <p className="text-slate-200">
                Deseja realmente remover <strong className="text-white font-semibold">"{deptToDelete}"</strong>?
              </p>
              {(equipment.some(e => e.department === deptToDelete) || tickets.some(t => t.department === deptToDelete)) && (
                <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-[11px] space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Registros vinculados:
                  </div>
                  <div>• {equipment.filter(e => e.department === deptToDelete).length} equipamento(s) vinculado(s)</div>
                  <div>• {tickets.filter(t => t.department === deptToDelete).length} chamado(s) histórico(s)</div>
                  <div className="text-slate-400 text-[10px] pt-0.5">Os chamados antigos preservarão o histórico arquivado.</div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                type="button"
                onClick={() => setDeptToDelete(null)}
                className="px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={() => confirmDeleteDepartment(deptToDelete)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-colors shadow flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sim, Remover Setor</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Ticket In-App Confirmation Modal */}
      {ticketToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl space-y-4 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg text-white">Apagar Chamado</h3>
                <p className="text-xs text-slate-400">Exclusão permanente do registro</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Tem certeza que deseja apagar o chamado <strong className="text-emerald-400 font-mono font-bold">[{ticketToDelete.code}]</strong>? Esta ação removerá todas as anotações e histórico do chamado.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                type="button"
                onClick={() => setTicketToDelete(null)}
                className="px-4 py-2 bg-slate-900 text-slate-300 rounded-lg text-xs hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={() => confirmDeleteTicket(ticketToDelete.id, ticketToDelete.code)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-colors shadow flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sim, Apagar Chamado</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Portal Link Modal for Servidores */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl min-w-0">
            <div className="p-3.5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950 z-10 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0">
                  <Link2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-white truncate">Link para Servidores Municipais</h3>
              </div>
              <button onClick={() => setIsShareModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900 shrink-0">✕</button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 text-xs sm:text-sm">
              <p className="text-slate-300 leading-relaxed">
                Envie o link abaixo para as secretarias e setores da prefeitura (Saúde, Educação, Gabinete, Obras, etc.). Ao abrir este link, o servidor verá apenas o <strong>Portal de Abertura de Chamados</strong> simplificado, sem acesso ao seu painel administrativo.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  URL Direta do Portal do Servidor:
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={getPortalLink()} 
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-cyan-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={copyPortalLink}
                    className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-start gap-2 text-emerald-400 font-medium">
                  <BellRing className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Notificação Instantânea Ativada:</span>
                </div>
                <p className="text-slate-400 leading-normal">
                  Quando o servidor clicar em "Enviar Chamado", o sistema toca automaticamente o sinal sonoro e exibe o alerta em tempo real neste seu painel de administrador.
                </p>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => {
                    setIsShareModalOpen(false);
                    setIsAdminPreview(true);
                    setViewMode('portal');
                  }}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Testar visão do servidor agora
                </button>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Routine Backup Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        data={{
          tickets,
          equipment,
          technicians,
          departments
        }}
      />

      {/* Cloud & Supabase Sync Modal */}
      <CloudSyncModal
        isOpen={isCloudSyncModalOpen}
        onClose={() => setIsCloudSyncModalOpen(false)}
        tickets={tickets}
        departments={departments}
        equipment={equipment}
        technicians={technicians}
        onDataLoaded={(data) => {
          if (data.tickets) {
            setTickets(data.tickets);
            try { localStorage.setItem('guaranesia_prod_tickets', JSON.stringify(data.tickets)); } catch (e) {}
          }
          if (data.departments) {
            setDepartments(sortDepartments(data.departments));
            try { localStorage.setItem('guaranesia_prod_departments', JSON.stringify(data.departments)); } catch (e) {}
          }
          if (data.equipment) {
            setEquipment(data.equipment);
            try { localStorage.setItem('guaranesia_prod_equipment', JSON.stringify(data.equipment)); } catch (e) {}
          }
          if (data.technicians) {
            setTechnicians(data.technicians);
            try { localStorage.setItem('guaranesia_prod_technicians', JSON.stringify(data.technicians)); } catch (e) {}
          }
          setSyncStatusMsg('Dados sincronizados com sucesso!');
          setTimeout(() => setSyncStatusMsg(null), 4000);
        }}
      />

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-4 px-6 text-center text-xs text-slate-500 no-print">
        Prefeitura Municipal de Guaranésia • Sistema Exclusivo de Controle de Chamados e Manutenção v1.0 (Produção)
      </footer>
    </div>
  );
}
