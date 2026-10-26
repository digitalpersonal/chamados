import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

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
      if (Array.isArray(parsed)) {
        return parsed;
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

      if (index === -1) {
        // If not found, add it
        tickets.unshift(updatedTicket);
      } else {
        tickets[index] = { ...tickets[index], ...updatedTicket };
      }
      saveStoredTickets(tickets);

      broadcastTicketEvent({
        type: 'UPDATE_TICKET',
        ticket: tickets[index >= 0 ? index : 0],
        timestamp: new Date().toISOString()
      });

      res.json({ success: true, ticket: tickets[index >= 0 ? index : 0] });
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
