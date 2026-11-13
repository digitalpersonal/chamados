import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import * as webpush from 'web-push';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

const DEPARTMENTS_FILE = path.join(DATA_DIR, 'departments.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const EQUIPMENT_FILE = path.join(DATA_DIR, 'equipment.json');
const TECHNICIANS_FILE = path.join(DATA_DIR, 'technicians.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const PUSH_SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

interface StoredPushSubscription {
  id: string;
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  role: 'admin' | 'technician';
  technicianId?: string | null;
  technicianName?: string | null;
  deviceLabel?: string | null;
  createdAt: string;
  updatedAt: string;
}

function getOrCreateVapidKeys(): { publicKey: string; privateKey: string } {
  const envPublic = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }

  try {
    if (fs.existsSync(VAPID_FILE)) {
      const content = fs.readFileSync(VAPID_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    }
  } catch (e) {}

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Could not persist vapid.json:', e);
  }
  return generated;
}

const vapidKeys = getOrCreateVapidKeys();
webpush.setVapidDetails(
  'mailto:ti@guaranesia.mg.gov.br',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

function getStoredPushSubscriptions(): StoredPushSubscription[] {
  try {
    if (fs.existsSync(PUSH_SUBSCRIPTIONS_FILE)) {
      const content = fs.readFileSync(PUSH_SUBSCRIPTIONS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading push-subscriptions.json:', e);
  }
  return [];
}

function saveStoredPushSubscriptions(subs: StoredPushSubscription[]) {
  try {
    fs.writeFileSync(PUSH_SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving push-subscriptions.json:', e);
  }
}

async function sendPushToProfessionals(
  payload: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    ticketId?: string;
    code?: string;
    department?: string;
    priority?: string;
  },
  options?: {
    targetTechnicianId?: string;
    onlyEndpoint?: string;
  }
): Promise<{ sentCount: number; failedCount: number }> {
  let subs = getStoredPushSubscriptions();
  if (subs.length === 0) return { sentCount: 0, failedCount: 0 };

  let targets = subs;
  if (options?.onlyEndpoint) {
    targets = subs.filter(s => s.endpoint === options.onlyEndpoint);
  } else if (options?.targetTechnicianId) {
    targets = subs.filter(
      s => s.role === 'admin' || (s.role === 'technician' && (!s.technicianId || s.technicianId === options.targetTechnicianId))
    );
  }

  let sentCount = 0;
  let failedCount = 0;
  const expiredEndpoints = new Set<string>();
  const jsonPayload = JSON.stringify({
    ...payload,
    timestamp: Date.now()
  });

  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            expirationTime: sub.expirationTime ?? null,
            keys: sub.keys
          },
          jsonPayload,
          { TTL: 60 * 60 * 24 } // Persist push message for 24h in push service if device is offline
        );
        sentCount++;
      } catch (err: any) {
        failedCount++;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          expiredEndpoints.add(sub.endpoint);
        } else {
          console.warn('Web Push send error:', err?.statusCode || err?.message);
        }
      }
    })
  );

  if (expiredEndpoints.size > 0) {
    const cleaned = subs.filter(s => !expiredEndpoints.has(s.endpoint));
    saveStoredPushSubscriptions(cleaned);
  }

  return { sentCount, failedCount };
}

function getStoredConfig(): { supabaseUrl?: string; supabaseAnonKey?: string } {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.supabaseUrl) return parsed;
    }
  } catch (e) {}

  const url = (process.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (url && anonKey && !url.includes('your-project')) {
    return { supabaseUrl: url, supabaseAnonKey: anonKey };
  }
  return {};
}

function saveStoredConfig(cfg: { supabaseUrl?: string; supabaseAnonKey?: string }) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving config.json:', e);
  }
}

const sortDepartments = (list: string[]): string[] =>
  [...list].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

const DEFAULT_DEPARTMENTS = sortDepartments([
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

// 1. Departments storage
function getStoredDepartments(): string[] {
  try {
    if (fs.existsSync(DEPARTMENTS_FILE)) {
      const content = fs.readFileSync(DEPARTMENTS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sortDepartments(parsed);
      }
    }
  } catch (e) {
    console.warn('Error reading departments.json:', e);
  }
  saveStoredDepartments(DEFAULT_DEPARTMENTS);
  return sortDepartments(DEFAULT_DEPARTMENTS);
}

function saveStoredDepartments(depts: string[]) {
  try {
    const sorted = sortDepartments(depts);
    fs.writeFileSync(DEPARTMENTS_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving departments.json:', e);
  }
}

// 2. Tickets storage
function getStoredTickets(): any[] {
  try {
    if (fs.existsSync(TICKETS_FILE)) {
      const content = fs.readFileSync(TICKETS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // Auto-restore from latest snapshot in backups directory if empty
    if (fs.existsSync(BACKUPS_DIR)) {
      const backupFiles = fs.readdirSync(BACKUPS_DIR).filter(f => f.startsWith('tickets_') && f.endsWith('.json'));
      if (backupFiles.length > 0) {
        backupFiles.sort().reverse();
        const latestPath = path.join(BACKUPS_DIR, backupFiles[0]);
        const backupContent = fs.readFileSync(latestPath, 'utf-8');
        const parsedBackup = JSON.parse(backupContent);
        if (Array.isArray(parsedBackup) && parsedBackup.length > 0) {
          saveStoredTickets(parsedBackup);
          return parsedBackup;
        }
      }
    }
  } catch (e) {
    console.warn('Error reading tickets.json:', e);
  }
  return [];
}

function saveStoredTickets(tickets: any[]) {
  try {
    fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2), 'utf-8');
    
    // Auto-create snapshot if tickets exist
    if (tickets.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const snapshotPath = path.join(BACKUPS_DIR, `tickets_${today}.json`);
      fs.writeFileSync(snapshotPath, JSON.stringify(tickets, null, 2), 'utf-8');
    }
  } catch (e) {
    console.error('Error saving tickets.json:', e);
  }
}

// 3. Equipment storage
function getStoredEquipment(): any[] {
  try {
    if (fs.existsSync(EQUIPMENT_FILE)) {
      const content = fs.readFileSync(EQUIPMENT_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading equipment.json:', e);
  }
  return [];
}

function saveStoredEquipment(equipment: any[]) {
  try {
    fs.writeFileSync(EQUIPMENT_FILE, JSON.stringify(equipment, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving equipment.json:', e);
  }
}

// 4. Technicians storage
function getStoredTechnicians(): any[] {
  try {
    if (fs.existsSync(TECHNICIANS_FILE)) {
      const content = fs.readFileSync(TECHNICIANS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading technicians.json:', e);
  }
  return [];
}

function saveStoredTechnicians(technicians: any[]) {
  try {
    fs.writeFileSync(TECHNICIANS_FILE, JSON.stringify(technicians, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving technicians.json:', e);
  }
}

// Pre-initialize stored files if they don't exist
getStoredDepartments();
getStoredTickets();
getStoredEquipment();
getStoredTechnicians();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Active SSE clients for real-time notification to administrators
  interface SSEClient {
    id: string;
    res: express.Response;
  }
  let sseClients: SSEClient[] = [];

  function broadcastTicketEvent(eventData: any) {
    const data = `data: ${JSON.stringify(eventData)}\n\n`;
    sseClients.forEach(client => {
      try {
        client.res.write(data);
      } catch (e) {
        // disconnected
      }
    });
  }

  // SSE Notifications Stream for Admin dashboard
  app.get('/api/events/notifications', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');

    const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    sseClients.push({ id: clientId, res });

    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
  });

  // ==========================================
  // WEB PUSH & SERVICE WORKER API (VAPID)
  // ==========================================

  app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({
      success: true,
      publicKey: vapidKeys.publicKey
    });
  });

  app.get('/api/push/status', (req, res) => {
    const subs = getStoredPushSubscriptions();
    res.json({
      success: true,
      configured: Boolean(vapidKeys.publicKey && vapidKeys.privateKey),
      totalSubscriptions: subs.length,
      adminCount: subs.filter(s => s.role === 'admin').length,
      technicianCount: subs.filter(s => s.role === 'technician').length,
      endpoints: subs.map(s => s.endpoint)
    });
  });

  app.post('/api/push/subscribe', (req, res) => {
    try {
      const { subscription, role, technicianId, technicianName, deviceLabel } = req.body;
      if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ success: false, error: 'Inscrição Push inválida.' });
      }

      const subs = getStoredPushSubscriptions();
      const now = new Date().toISOString();
      const normalizedRole: 'admin' | 'technician' = role === 'admin' ? 'admin' : 'technician';

      const existingIdx = subs.findIndex(s => s.endpoint === subscription.endpoint);
      const record: StoredPushSubscription = {
        id: existingIdx >= 0 ? subs[existingIdx].id : `push-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime ?? null,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        role: normalizedRole,
        technicianId: technicianId || null,
        technicianName: technicianName || null,
        deviceLabel: deviceLabel || 'Navegador',
        createdAt: existingIdx >= 0 ? subs[existingIdx].createdAt : now,
        updatedAt: now
      };

      if (existingIdx >= 0) {
        subs[existingIdx] = record;
      } else {
        subs.push(record);
      }

      saveStoredPushSubscriptions(subs);
      res.json({
        success: true,
        totalSubscriptions: subs.length,
        message: 'Dispositivo inscrito para alertas Push em segundo plano.'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ success: false, error: 'Endpoint obrigatório.' });
      }
      const subs = getStoredPushSubscriptions().filter(s => s.endpoint !== endpoint);
      saveStoredPushSubscriptions(subs);
      res.json({ success: true, totalSubscriptions: subs.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/push/test', async (req, res) => {
    try {
      const { endpoint, delaySeconds, role, technicianId } = req.body || {};
      const delayMs = Math.min(Math.max(Number(delaySeconds) || 0, 0), 15) * 1000;

      const testPayload = {
        title: '🔔 Teste de Notificação em Segundo Plano',
        body: delayMs > 0
          ? 'Alerta entregue pelo Service Worker com a aba fechada! Clique para abrir o painel.'
          : 'Notificações Push configuradas com sucesso! Novos agendamentos e chamados aparecerão instantaneamente.',
        tag: `test-push-${Date.now()}`,
        url: role === 'admin' ? '/' : '/?portal=tecnico'
      };

      if (delayMs > 0) {
        setTimeout(() => {
          sendPushToProfessionals(testPayload, {
            onlyEndpoint: endpoint || undefined,
            targetTechnicianId: technicianId || undefined
          }).catch(() => {});
        }, delayMs);

        return res.json({
          success: true,
          scheduled: true,
          delaySeconds: delayMs / 1000,
          message: `Alerta agendado para daqui a ${delayMs / 1000} segundos. Você já pode fechar esta aba!`
        });
      }

      const result = await sendPushToProfessionals(testPayload, {
        onlyEndpoint: endpoint || undefined,
        targetTechnicianId: technicianId || undefined
      });

      res.json({
        success: result.sentCount > 0,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        message: result.sentCount > 0
          ? `Notificação de teste enviada para ${result.sentCount} dispositivo(s).`
          : 'Nenhum dispositivo inscrito encontrado para envio.'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // SYSTEM STATE & BIDIRECTIONAL SYNC API
  // ==========================================

  // Get complete authoritative system state
  app.get('/api/system/state', (req, res) => {
    try {
      res.json({
        success: true,
        tickets: getStoredTickets(),
        equipment: getStoredEquipment(),
        technicians: getStoredTechnicians(),
        departments: getStoredDepartments()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Global system database credentials configuration discovery
  app.get('/api/system/config', (req, res) => {
    try {
      const cfg = getStoredConfig();
      res.json({
        success: true,
        supabaseUrl: cfg.supabaseUrl || '',
        supabaseAnonKey: cfg.supabaseAnonKey || '',
        configured: Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/system/config', (req, res) => {
    try {
      const { supabaseUrl, supabaseAnonKey } = req.body;
      if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(400).json({ success: false, error: 'Credenciais inválidas.' });
      }
      saveStoredConfig({ supabaseUrl: supabaseUrl.trim(), supabaseAnonKey: supabaseAnonKey.trim() });
      res.json({ success: true, message: 'Configuração salva no servidor para todos os dispositivos.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/system/config', (req, res) => {
    try {
      saveStoredConfig({});
      res.json({ success: true, message: 'Configuração removida.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Full bidirectional sync: merges client and server states so no tickets or sectors are ever lost
  app.post('/api/system/sync', (req, res) => {
    try {
      const { tickets: clientTickets, equipment: clientEq, technicians: clientTechs, departments: clientDepts } = req.body;

      // 1. Merge tickets
      const serverTickets = getStoredTickets();
      const ticketMap = new Map<string, any>();
      // Put server tickets first
      serverTickets.forEach((t: any) => { if (t && t.id) ticketMap.set(t.id, t); });
      // If client has tickets (from local storage yesterday), merge them
      if (Array.isArray(clientTickets)) {
        clientTickets.forEach((ct: any) => {
          if (!ct || !ct.id) return;
          if (!ticketMap.has(ct.id)) {
            ticketMap.set(ct.id, ct);
          } else {
            // Pick latest updated
            const existing = ticketMap.get(ct.id);
            const ctTime = new Date(ct.updatedAt || ct.createdAt || 0).getTime();
            const exTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
            if (ctTime > exTime) {
              ticketMap.set(ct.id, ct);
            }
          }
        });
      }
      const mergedTickets = Array.from(ticketMap.values()).sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      saveStoredTickets(mergedTickets);

      // 2. Merge equipment
      const serverEq = getStoredEquipment();
      const eqMap = new Map<string, any>();
      serverEq.forEach((eq: any) => { if (eq && eq.id) eqMap.set(eq.id, eq); });
      if (Array.isArray(clientEq)) {
        clientEq.forEach((eq: any) => {
          if (eq && eq.id && !eqMap.has(eq.id)) eqMap.set(eq.id, eq);
        });
      }
      const mergedEquipment = Array.from(eqMap.values());
      saveStoredEquipment(mergedEquipment);

      // 3. Merge technicians
      const serverTechs = getStoredTechnicians();
      const techMap = new Map<string, any>();
      serverTechs.forEach((tc: any) => { if (tc && tc.id) techMap.set(tc.id, tc); });
      if (Array.isArray(clientTechs)) {
        clientTechs.forEach((tc: any) => {
          if (tc && tc.id && !techMap.has(tc.id)) techMap.set(tc.id, tc);
        });
      }
      const mergedTechs = Array.from(techMap.values());
      saveStoredTechnicians(mergedTechs);

      // 4. Merge departments
      const serverDepts = getStoredDepartments();
      const deptsSet = new Set<string>(serverDepts);
      if (Array.isArray(clientDepts)) {
        clientDepts.forEach((d: any) => {
          if (typeof d === 'string' && d.trim()) deptsSet.add(d.trim());
        });
      }
      // Also ensure any department referenced in tickets is preserved
      mergedTickets.forEach((t: any) => {
        if (t.department && typeof t.department === 'string') deptsSet.add(t.department.trim());
      });
      const mergedDepts = sortDepartments(Array.from(deptsSet));
      saveStoredDepartments(mergedDepts);

      res.json({
        success: true,
        message: 'Sincronização persistente concluída com sucesso.',
        tickets: mergedTickets,
        equipment: mergedEquipment,
        technicians: mergedTechs,
        departments: mergedDepts
      });
    } catch (err: any) {
      console.error('Error during system sync:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // TICKETS API (PERSISTED ON SERVER DISK)
  // ==========================================

  app.get('/api/tickets', (req, res) => {
    res.json({ success: true, tickets: getStoredTickets() });
  });

  app.post('/api/tickets', (req, res) => {
    try {
      const ticket = req.body;
      if (!ticket || !ticket.id || !ticket.title) {
        return res.status(400).json({ success: false, error: 'Dados do chamado inválidos.' });
      }

      const tickets = getStoredTickets();
      const existingIdx = tickets.findIndex(t => t.id === ticket.id);
      const isBrandNew = existingIdx < 0;
      if (existingIdx >= 0) {
        tickets[existingIdx] = ticket;
      } else {
        tickets.unshift(ticket);
      }
      saveStoredTickets(tickets);

      broadcastTicketEvent({
        type: 'NEW_TICKET',
        ticket,
        timestamp: new Date().toISOString()
      });

      if (isBrandNew) {
        sendPushToProfessionals(
          {
            title: `🚨 Novo Chamado/Agendamento: ${ticket.code}`,
            body: `${ticket.title} • Setor: ${ticket.department} (${ticket.priority || 'Média'})`,
            tag: `ticket-${ticket.id}`,
            url: `/?portal=tecnico&codigo=${encodeURIComponent(ticket.code)}`,
            ticketId: ticket.id,
            code: ticket.code,
            department: ticket.department,
            priority: ticket.priority
          },
          { targetTechnicianId: ticket.technicianId || undefined }
        ).catch(() => {});
      }

      res.json({ success: true, ticket });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/tickets/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updatedTicket = req.body;
      const tickets = getStoredTickets();
      const index = tickets.findIndex(t => t.id === id);
      const prevTechnicianId = index >= 0 ? tickets[index].technicianId : undefined;

      if (index === -1) {
        // If not found, add it
        tickets.unshift(updatedTicket);
      } else {
        tickets[index] = { ...tickets[index], ...updatedTicket };
      }
      saveStoredTickets(tickets);

      const savedTicket = tickets[index >= 0 ? index : 0];
      broadcastTicketEvent({
        type: 'UPDATE_TICKET',
        ticket: savedTicket,
        timestamp: new Date().toISOString()
      });

      // Notify technician instantly when assigned a ticket
      if (savedTicket?.technicianId && savedTicket.technicianId !== prevTechnicianId) {
        sendPushToProfessionals(
          {
            title: `📌 Atendimento Atribuído: ${savedTicket.code}`,
            body: `${savedTicket.title} • Setor: ${savedTicket.department}`,
            tag: `assign-${savedTicket.id}`,
            url: `/?portal=tecnico&codigo=${encodeURIComponent(savedTicket.code)}`,
            ticketId: savedTicket.id,
            code: savedTicket.code,
            department: savedTicket.department,
            priority: savedTicket.priority
          },
          { targetTechnicianId: savedTicket.technicianId }
        ).catch(() => {});
      }

      res.json({ success: true, ticket: savedTicket });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/tickets/:id', (req, res) => {
    try {
      const { id } = req.params;
      let tickets = getStoredTickets();
      tickets = tickets.filter(t => t.id !== id);
      saveStoredTickets(tickets);

      broadcastTicketEvent({
        type: 'DELETE_TICKET',
        ticketId: id,
        timestamp: new Date().toISOString()
      });

      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Public endpoint for civil servants to submit tickets
  app.post('/api/tickets/public', async (req, res) => {
    try {
      const { title, description, equipmentType, department, requesterName, requesterContact, priority, deadline, equipmentId } = req.body;
      
      if (!title || !description || !department) {
        return res.status(400).json({ success: false, error: 'Por favor, preencha o título, descrição e secretaria/setor.' });
      }

      const tickets = getStoredTickets();
      const nextNum = tickets.length + 1;
      const code = `CH-${new Date().getFullYear()}-${String(nextNum).padStart(3, '0')}`;
      const now = new Date().toISOString();

      const newTicket = {
        id: `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        code,
        title: title.trim(),
        description: description.trim(),
        equipmentType: equipmentType || 'Outros',
        equipmentId: equipmentId || undefined,
        department: department.trim(),
        requesterName: requesterName ? requesterName.trim() : 'Servidor Municipal',
        requesterContact: requesterContact ? requesterContact.trim() : '',
        status: 'Aberto',
        priority: priority || 'Média',
        deadline: deadline || undefined,
        archived: false,
        createdAt: now,
        updatedAt: now,
        notes: [
          {
            id: `n-${Date.now()}`,
            author: requesterName ? `Solicitante: ${requesterName.trim()}` : 'Servidor Municipal',
            text: `Chamado aberto pelo Portal do Servidor. Contato informado: ${requesterContact ? requesterContact.trim() : 'Não informado'}.`,
            timestamp: now
          }
        ]
      };

      // PERSIST DIRECTLY TO SERVER DISK!
      tickets.unshift(newTicket);
      saveStoredTickets(tickets);

      // Real-time broadcast to all connected administrator screens!
      broadcastTicketEvent({
        type: 'NEW_TICKET',
        ticket: newTicket,
        timestamp: now
      });

      // Dispatch persistent Web Push notifications to professionals (even with closed tabs)
      sendPushToProfessionals({
        title: `🚨 Novo Agendamento/Chamado: ${newTicket.code}`,
        body: `${newTicket.title} • Setor: ${newTicket.department}${newTicket.requesterName ? ` (${newTicket.requesterName})` : ''}`,
        tag: `ticket-${newTicket.id}`,
        url: `/?portal=tecnico&codigo=${encodeURIComponent(newTicket.code)}`,
        ticketId: newTicket.id,
        code: newTicket.code,
        department: newTicket.department,
        priority: newTicket.priority
      }).catch(() => {});

      res.json({ success: true, ticket: newTicket });
    } catch (error: any) {
      console.error('Error creating public ticket:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao abrir chamado.' });
    }
  });

  // ==========================================
  // EQUIPMENT API (PERSISTED ON SERVER DISK)
  // ==========================================

  app.get('/api/equipment', (req, res) => {
    res.json({ success: true, equipment: getStoredEquipment() });
  });

  app.post('/api/equipment', (req, res) => {
    try {
      const eq = req.body;
      if (!eq || !eq.name) {
        return res.status(400).json({ success: false, error: 'Nome do equipamento é obrigatório.' });
      }
      const list = getStoredEquipment();
      const existingIdx = list.findIndex(e => e.id === eq.id);
      if (existingIdx >= 0) {
        list[existingIdx] = eq;
      } else {
        list.push(eq);
      }
      saveStoredEquipment(list);
      res.json({ success: true, equipment: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/equipment/:id', (req, res) => {
    try {
      const { id } = req.params;
      let list = getStoredEquipment();
      list = list.filter(e => e.id !== id);
      saveStoredEquipment(list);
      res.json({ success: true, equipment: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // TECHNICIANS API (PERSISTED ON SERVER DISK)
  // ==========================================

  app.get('/api/technicians', (req, res) => {
    res.json({ success: true, technicians: getStoredTechnicians() });
  });

  app.post('/api/technicians', (req, res) => {
    try {
      const tech = req.body;
      if (!tech || !tech.name) {
        return res.status(400).json({ success: false, error: 'Nome do técnico é obrigatório.' });
      }
      const list = getStoredTechnicians();
      const existingIdx = list.findIndex(t => t.id === tech.id);
      if (existingIdx >= 0) {
        list[existingIdx] = tech;
      } else {
        list.push(tech);
      }
      saveStoredTechnicians(list);
      res.json({ success: true, technicians: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/technicians/:id', (req, res) => {
    try {
      const { id } = req.params;
      let list = getStoredTechnicians();
      list = list.filter(t => t.id !== id);
      saveStoredTechnicians(list);
      res.json({ success: true, technicians: list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // DEPARTMENTS API (PERSISTED ON SERVER DISK)
  // ==========================================

  app.get('/api/departments', (req, res) => {
    res.json({ success: true, departments: getStoredDepartments() });
  });

  app.post('/api/departments', (req, res) => {
    try {
      const { name, departments: fullList } = req.body;
      let current = getStoredDepartments();
      if (Array.isArray(fullList)) {
        current = sortDepartments(fullList);
      } else if (name && typeof name === 'string' && name.trim()) {
        const clean = name.trim();
        if (!current.some(d => d.toLowerCase() === clean.toLowerCase())) {
          current.push(clean);
        }
        current = sortDepartments(current);
      }
      saveStoredDepartments(current);
      res.json({ success: true, departments: current });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/departments', (req, res) => {
    try {
      const { oldName, newName, departments: fullList } = req.body;
      let current = getStoredDepartments();
      if (Array.isArray(fullList)) {
        current = sortDepartments(fullList);
      } else if (oldName && newName) {
        current = sortDepartments(current.map(d => d === oldName ? newName.trim() : d));
      }
      saveStoredDepartments(current);
      res.json({ success: true, departments: current });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const handleDeleteDepartment = (req: express.Request, res: express.Response) => {
    try {
      const name = (req.body?.name || req.query?.name || '') as string;
      const fullList = req.body?.departments;
      let current = getStoredDepartments();
      if (Array.isArray(fullList)) {
        current = sortDepartments(fullList);
      } else if (name && typeof name === 'string' && name.trim()) {
        const clean = name.trim().toLowerCase();
        current = sortDepartments(current.filter(d => d.toLowerCase() !== clean));
      }
      saveStoredDepartments(current);
      res.json({ success: true, departments: current });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.delete('/api/departments', handleDeleteDepartment);
  app.post('/api/departments/delete', handleDeleteDepartment);

  // Broadcast manual admin tickets
  app.post('/api/tickets/broadcast', (req, res) => {
    try {
      const { ticket, eventType } = req.body;
      if (ticket) {
        const tickets = getStoredTickets();
        const existingIdx = tickets.findIndex(t => t.id === ticket.id);
        if (existingIdx >= 0) {
          tickets[existingIdx] = ticket;
        } else {
          tickets.unshift(ticket);
        }
        saveStoredTickets(tickets);

        broadcastTicketEvent({
          type: eventType || 'NEW_TICKET',
          ticket,
          timestamp: new Date().toISOString()
        });

        if (!eventType || eventType === 'NEW_TICKET') {
          sendPushToProfessionals(
            {
              title: `🚨 Novo Chamado: ${ticket.code}`,
              body: `${ticket.title} • Setor: ${ticket.department}`,
              tag: `ticket-${ticket.id}`,
              url: `/?portal=tecnico&codigo=${encodeURIComponent(ticket.code)}`,
              ticketId: ticket.id,
              code: ticket.code,
              department: ticket.department,
              priority: ticket.priority
            },
            { targetTechnicianId: ticket.technicianId || undefined }
          ).catch(() => {});
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==========================================
  // GEMINI AI DIAGNOSTICS API
  // ==========================================

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  app.post('/api/gemini/diagnose', async (req, res) => {
    try {
      const { title, description, equipmentType, department } = req.body;

      const prompt = `Você é um especialista sênior em suporte de TI e manutenção de equipamentos e sistemas públicos na Prefeitura Municipal de Guaranésia. 
Analise o seguinte chamado técnico:
- Tipo de Serviço/Equipamento: ${equipmentType}
- Setor / Secretaria Solicitante: ${department}
- Título do Chamado: ${title}
- Descrição da Demanda: ${description}

(Nota: Se for "Atualização do Site", considere publicação de notícias, editais, decretos, diário oficial, transparência, correção de links ou banners no portal institucional).

Por favor, forneça em formato JSON estrito (sem blocos markdown adicionais, apenas o JSON puro) contendo:
1. "diagnostico": Uma análise rápida da provável causa ou requisitos da solicitação (máximo 2 frases).
2. "passosResolucao": Um array com 3 a 4 passos práticos para o técnico/webmaster executar o serviço (ex: formatar texto, otimizar imagem, publicar no CMS/Portal, testar link no ar, etc.).
3. "pecasSugeridas": Um array com possíveis peças, suprimentos ou anexos/documentos necessários (ex: "Arquivo PDF do Edital assinado", "Banner 1920x600px", "Credenciais do CMS"), ou vazio se não aplicável.
4. "tempoEstimado": Estimativa de tempo para resolução (ex: "30 minutos", "1 hora").`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = response.text || '{}';
      let data;
      try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        data = JSON.parse(cleaned);
      } catch (e) {
        data = {
          diagnostico: "Não foi possível estruturar o JSON, mas verifique conexões e drivers.",
          passosResolucao: ["Reiniciar o equipamento", "Verificar cabos e conexões", "Acionar técnico responsável"],
          pecasSugeridas: [],
          tempoEstimado: "1 hora"
        };
      }

      res.json({ success: true, result: data });
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Erro ao consultar IA' });
    }
  });

  app.use('/sw.js', (req, res, next) => {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  });

  if (isProduction) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Prefeitura de Guaranésia Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
