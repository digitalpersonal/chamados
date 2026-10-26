import { getSupabaseClient, isSupabaseReady } from './supabase';
import { Ticket, Equipment, Technician } from '../App';

export interface CloudSyncResult {
  success: boolean;
  message: string;
  source: 'supabase' | 'server' | 'local';
  tickets?: Ticket[];
  departments?: string[];
  equipment?: Equipment[];
  technicians?: Technician[];
  error?: string;
}

const sortDepartments = (list: string[]): string[] =>
  [...list].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

/**
 * Direct Supabase Cloud Database synchronization.
 * Connects directly from the browser to Supabase PostgreSQL,
 * ensuring seamless real-time persistence across Dev, Vercel, and Shared App.
 */
export async function syncWithSupabase(localState: {
  tickets: Ticket[];
  departments: string[];
  equipment: Equipment[];
  technicians: Technician[];
}): Promise<CloudSyncResult | null> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseReady()) {
    return null;
  }

  console.log('--- Inicidando Sincronização Supabase ---');

  try {
    let cloudTickets: Ticket[] = [];
    let cloudDepartments: string[] = [];
    let cloudEquipment: Equipment[] = [];
    let cloudTechnicians: Technician[] = [];
    let tablesMissing = false;

    // 1. Try reading the unified system_state table
    try {
      const { data: stateData, error: stateError } = await client
        .from('system_state')
        .select('payload')
        .eq('id', 'guaranesia_production_state')
        .maybeSingle();

      if (stateError) {
        if (stateError.code === '42P01') tablesMissing = true;
        console.warn('system_state read error:', stateError);
      } else if (stateData && stateData.payload) {
        const p = stateData.payload;
        if (Array.isArray(p.tickets)) cloudTickets = p.tickets;
        if (Array.isArray(p.departments)) cloudDepartments = p.departments;
        if (Array.isArray(p.equipment)) cloudEquipment = p.equipment;
        if (Array.isArray(p.technicians)) cloudTechnicians = p.technicians;
        console.log(`Payload system_state carregado: ${cloudTickets.length} chamados.`);
      }
    } catch (e) {
      console.warn('system_state catch notice:', e);
    }

    // 2. ALSO query individual structured tables and merge with system_state payload
    // A. Departments
    try {
      const { data: deptData, error: dErr } = await client.from('departments').select('name');
      if (!dErr && Array.isArray(deptData) && deptData.length > 0) {
        const setDepts = new Set<string>([...cloudDepartments, ...deptData.map(d => d.name).filter(Boolean)]);
        cloudDepartments = Array.from(setDepts);
      }
    } catch (e) {}

    // B. Technicians
    try {
      const { data: techData, error: tErr } = await client.from('technicians').select('*');
      if (!tErr && Array.isArray(techData)) {
        const techMap = new Map<string, Technician>();
        cloudTechnicians.forEach(t => techMap.set(t.id, t));
        techData.forEach(t => {
          if (t && t.id) {
            techMap.set(t.id, {
              id: t.id,
              name: t.name,
              type: t.type as any,
              company: t.company || undefined,
              phone: t.phone || '',
              email: t.email || '',
              specialty: t.specialty || ''
            });
          }
        });
        cloudTechnicians = Array.from(techMap.values());
      }
    } catch (e) {}

    // C. Equipment
    try {
      const { data: eqData, error: eErr } = await client.from('equipment').select('*');
      if (!eErr && Array.isArray(eqData)) {
        const eqMap = new Map<string, Equipment>();
        cloudEquipment.forEach(eq => eqMap.set(eq.id, eq));
        eqData.forEach(eq => {
          if (eq && eq.id) {
            eqMap.set(eq.id, {
              id: eq.id,
              name: eq.name,
              type: eq.type as any,
              model: eq.model || '',
              serialNumber: eq.serial_number || '',
              department: eq.department,
              ipAddress: eq.ip_address || '',
              status: eq.status as any || 'Operacional'
            });
          }
        });
        cloudEquipment = Array.from(eqMap.values());
      }
    } catch (e) {}

    // D. Tickets
    try {
      const { data: tData, error: tkErr } = await client
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (tkErr) {
        if (tkErr.code === '42P01') tablesMissing = true;
        console.warn('tickets read error:', tkErr);
      } else if (Array.isArray(tData)) {
        console.log(`Tabela tickets carregada: ${tData.length} registros.`);
        // Fetch notes
        const { data: notesData } = await client.from('ticket_notes').select('*');
        const notesByTicket: Record<string, any[]> = {};
        if (Array.isArray(notesData)) {
          notesData.forEach(n => {
            if (n && n.ticket_id) {
              if (!notesByTicket[n.ticket_id]) notesByTicket[n.ticket_id] = [];
              notesByTicket[n.ticket_id].push({
                id: n.id,
                author: n.author,
                text: n.text,
                timestamp: n.timestamp
              });
            }
          });
        }

        const tMap = new Map<string, Ticket>();
        cloudTickets.forEach(t => tMap.set(t.id, t));

        tData.forEach(t => {
          if (t && t.id) {
            tMap.set(t.id, {
              id: t.id,
              code: t.code,
              equipmentId: t.equipment_id || undefined,
              equipmentType: t.equipment_type as any,
              department: t.department,
              title: t.title,
              description: t.description,
              status: t.status as any,
              priority: t.priority as any,
              technicianId: t.technician_id || undefined,
              createdAt: t.created_at,
              updatedAt: t.updated_at,
              deadline: t.deadline || undefined,
              notes: notesByTicket[t.id] || [],
              partsUsed: t.parts_used || [],
              resolutionNotes: t.resolution_notes || undefined,
              cost: t.cost ? Number(t.cost) : undefined,
              aiDiagnosis: t.ai_diagnosis || undefined,
              archived: t.is_archived || false
            });
          }
        });
        cloudTickets = Array.from(tMap.values());
      }
    } catch (e) {}

    // 3. Bidirectional merge
    // Use cloud data as primary, but keep any local data that is newer or missing in cloud
    const mergedDeptsSet = new Set<string>([...cloudDepartments, ...localState.departments]);
    const mergedDepartments = sortDepartments(Array.from(mergedDeptsSet));

    const techMap = new Map<string, Technician>();
    cloudTechnicians.forEach(t => techMap.set(t.id, t));
    localState.technicians.forEach(t => { if (!techMap.has(t.id)) techMap.set(t.id, t); });
    const mergedTechnicians = Array.from(techMap.values());

    const eqMap = new Map<string, Equipment>();
    cloudEquipment.forEach(eq => eqMap.set(eq.id, eq));
    localState.equipment.forEach(eq => { if (!eqMap.has(eq.id)) eqMap.set(eq.id, eq); });
    const mergedEquipment = Array.from(eqMap.values());

    const ticketMap = new Map<string, Ticket>();
    cloudTickets.forEach(t => ticketMap.set(t.id, t));
    localState.tickets.forEach(t => {
      if (!ticketMap.has(t.id)) {
        ticketMap.set(t.id, t);
      } else {
        const existing = ticketMap.get(t.id)!;
        const localTime = new Date(t.updatedAt || t.createdAt || 0).getTime();
        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        if (localTime > existingTime) {
          ticketMap.set(t.id, t);
        }
      }
    });
    const mergedTickets = Array.from(ticketMap.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // 4. Update cloud state mirror ONLY IF we have something to push or if we found existing data
    if (mergedTickets.length > 0 || cloudTickets.length > 0) {
      await pushStateToSupabase(client, {
        tickets: mergedTickets,
        departments: mergedDepartments,
        equipment: mergedEquipment,
        technicians: mergedTechnicians
      });
    }

    if (tablesMissing && cloudTickets.length === 0) {
      return {
        success: false,
        message: 'Conectado ao Supabase, mas as tabelas ainda não foram criadas no banco de dados. Use a aba "Criar Tabelas (SQL)" no modal de sincronização.',
        source: 'supabase',
        error: 'Tabelas não encontradas'
      };
    }

    return {
      success: true,
      message: `Conectado ao Supabase! ${mergedTickets.length} chamados sincronizados na nuvem.`,
      source: 'supabase',
      tickets: mergedTickets,
      departments: mergedDepartments,
      equipment: mergedEquipment,
      technicians: mergedTechnicians
    };
  } catch (err: any) {
    console.warn('Supabase sync critical error:', err);
    return {
      success: false,
      message: 'Falha ao sincronizar com o Supabase: ' + (err.message || 'Erro de rede'),
      source: 'supabase',
      error: err.message
    };
  }
}

/**
 * Pushes entire application state to Supabase system_state table and structured tables
 */
export async function pushStateToSupabase(
  client: any,
  state: {
    tickets: Ticket[];
    departments: string[];
    equipment: Equipment[];
    technicians: Technician[];
  }
) {
  if (!client) return;

  const now = new Date().toISOString();

  // A. Save to system_state table
  try {
    await client
      .from('system_state')
      .upsert({
        id: 'guaranesia_production_state',
        payload: state,
        updated_at: now
      }, { onConflict: 'id' });
  } catch (e) {
    console.warn('Could not upsert system_state:', e);
  }

  // B. Also upsert departments table
  try {
    if (state.departments.length > 0) {
      const deptsPayload = state.departments.map(d => ({ name: d }));
      await client.from('departments').upsert(deptsPayload, { onConflict: 'name' });
    }
  } catch (e) {}

  // C. Also upsert technicians table
  try {
    if (state.technicians.length > 0) {
      const techPayload = state.technicians.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        company: t.company || null,
        phone: t.phone || null,
        email: t.email || null,
        specialty: t.specialty || null
      }));
      await client.from('technicians').upsert(techPayload, { onConflict: 'id' });
    }
  } catch (e) {}

  // D. Also upsert equipment table
  try {
    if (state.equipment.length > 0) {
      const eqPayload = state.equipment.map(eq => ({
        id: eq.id,
        name: eq.name,
        type: eq.type,
        model: eq.model || null,
        serial_number: eq.serialNumber || null,
        department: eq.department,
        ip_address: eq.ipAddress || null,
        status: eq.status || 'Operacional'
      }));
      await client.from('equipment').upsert(eqPayload, { onConflict: 'id' });
    }
  } catch (e) {}

  // E. Also upsert tickets table
  try {
    if (state.tickets.length > 0) {
      const ticketPayload = state.tickets.map(t => ({
        id: t.id,
        code: t.code,
        equipment_id: t.equipmentId || null,
        equipment_type: t.equipmentType,
        department: t.department,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        technician_id: t.technicianId || null,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
        resolution_notes: t.resolutionNotes || null,
        cost: t.cost || 0,
        ai_diagnosis: t.aiDiagnosis || null,
        is_archived: t.archived || false
      }));
      await client.from('tickets').upsert(ticketPayload, { onConflict: 'id' });
    }
  } catch (e) {}
}

/**
 * Persists a single ticket to Supabase
 */
export async function saveTicketToSupabase(ticket: Ticket, allTickets: Ticket[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseReady()) return false;

  try {
    // 1. Upsert structured ticket
    await client.from('tickets').upsert({
      id: ticket.id,
      code: ticket.code,
      equipment_id: ticket.equipmentId || null,
      equipment_type: ticket.equipmentType,
      department: ticket.department,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      technician_id: ticket.technicianId || null,
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
      resolution_notes: ticket.resolutionNotes || null,
      cost: ticket.cost || 0,
      ai_diagnosis: ticket.aiDiagnosis || null,
      is_archived: ticket.archived || false
    }, { onConflict: 'id' });

    // 2. Upsert notes if any
    if (ticket.notes && ticket.notes.length > 0) {
      const notesPayload = ticket.notes.map(n => ({
        id: n.id,
        ticket_id: ticket.id,
        author: n.author,
        text: n.text,
        timestamp: n.timestamp
      }));
      await client.from('ticket_notes').upsert(notesPayload, { onConflict: 'id' });
    }

    // 3. Update system_state mirror
    try {
      const { data } = await client
        .from('system_state')
        .select('payload')
        .eq('id', 'guaranesia_production_state')
        .maybeSingle();

      const existingPayload = data?.payload || { tickets: [], departments: [], equipment: [], technicians: [] };
      const updatedTickets = [ticket, ...(existingPayload.tickets || []).filter((t: Ticket) => t.id !== ticket.id)];
      existingPayload.tickets = updatedTickets;

      await client.from('system_state').upsert({
        id: 'guaranesia_production_state',
        payload: existingPayload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn('Error saving ticket to Supabase:', err);
    return false;
  }
}

/**
 * Deletes a ticket from Supabase
 */
export async function deleteTicketFromSupabase(ticketId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseReady()) return false;

  try {
    await client.from('ticket_notes').delete().eq('ticket_id', ticketId);
    await client.from('tickets').delete().eq('id', ticketId);

    // Update system_state mirror
    try {
      const { data } = await client
        .from('system_state')
        .select('payload')
        .eq('id', 'guaranesia_production_state')
        .maybeSingle();

      if (data?.payload) {
        data.payload.tickets = (data.payload.tickets || []).filter((t: Ticket) => t.id !== ticketId);
        await client.from('system_state').upsert({
          id: 'guaranesia_production_state',
          payload: data.payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      }
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn('Error deleting ticket from Supabase:', err);
    return false;
  }
}

/**
 * Saves a department to Supabase
 */
export async function saveDepartmentToSupabase(name: string, allDepts: string[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseReady()) return false;

  try {
    await client.from('departments').upsert({ name }, { onConflict: 'name' });

    // Update system_state mirror
    try {
      const { data } = await client
        .from('system_state')
        .select('payload')
        .eq('id', 'guaranesia_production_state')
        .maybeSingle();

      const payload = data?.payload || { tickets: [], departments: [], equipment: [], technicians: [] };
      payload.departments = sortDepartments(allDepts);
      await client.from('system_state').upsert({
        id: 'guaranesia_production_state',
        payload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn('Error saving department to Supabase:', err);
    return false;
  }
}

/**
 * Deletes a department from Supabase
 */
export async function deleteDepartmentFromSupabase(name: string, remainingDepts: string[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseReady()) return false;

  try {
    await client.from('departments').delete().eq('name', name);

    // Update system_state mirror
    try {
      const { data } = await client
        .from('system_state')
        .select('payload')
        .eq('id', 'guaranesia_production_state')
        .maybeSingle();

      if (data?.payload) {
        data.payload.departments = sortDepartments(remainingDepts);
        await client.from('system_state').upsert({
          id: 'guaranesia_production_state',
          payload: data.payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      }
    } catch (e) {}

    return true;
  } catch (err) {
    console.warn('Error deleting department from Supabase:', err);
    return false;
  }
}
