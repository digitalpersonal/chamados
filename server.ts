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

const DEPARTMENTS_FILE = path.join(DATA_DIR, 'departments.json');

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

function getStoredDepartments(): string[] {
  try {
    if (fs.existsSync(DEPARTMENTS_FILE)) {
      const content = fs.readFileSync(DEPARTMENTS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
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

async function startServer() {
  const app = express();
  app.use(express.json());

  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Departments CRUD API with robust server-side persistence and alphabetical sorting
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

  // Initialize Gemini AI client for server-side usage
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API endpoint for AI Troubleshooting / Diagnostics & Ticket Recommendations
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
        // handle disconnected client
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

  // Public endpoint for civil servants / departments to submit tickets without admin login
  app.post('/api/tickets/public', async (req, res) => {
    try {
      const { title, description, equipmentType, department, requesterName, requesterContact, priority } = req.body;
      
      if (!title || !description || !department) {
        return res.status(400).json({ success: false, error: 'Por favor, preencha o título, descrição e secretaria/setor.' });
      }

      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const code = `CH-${new Date().getFullYear()}-${randomSuffix}`;
      const now = new Date().toISOString();

      const newTicket = {
        id: `t-${Date.now()}`,
        code,
        title: title.trim(),
        description: description.trim(),
        equipmentType: equipmentType || 'Outros',
        department: department.trim(),
        requesterName: requesterName ? requesterName.trim() : 'Servidor Municipal',
        requesterContact: requesterContact ? requesterContact.trim() : '',
        status: 'Aberto',
        priority: priority || 'Média',
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

  // Broadcast manual admin tickets
  app.post('/api/tickets/broadcast', (req, res) => {
    try {
      const { ticket, eventType } = req.body;
      if (ticket) {
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

  if (isProduction) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // Create Vite server in middleware mode
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
