/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { Ticket, Equipment, Technician } from '../App';

export interface BackupRecord {
  id: string;
  filename: string;
  backupType: string;
  timestamp: string;
  ticketsCount: number;
  equipmentCount: number;
  techniciansCount: number;
  departmentsCount: number;
  supabaseSynced: boolean;
  sizeBytes?: number;
}

export interface BackupPayload {
  version: string;
  system: string;
  timestamp: string;
  counts: {
    tickets: number;
    equipment: number;
    technicians: number;
    departments: number;
  };
  data: {
    tickets: Ticket[];
    equipment: Equipment[];
    technicians: Technician[];
    departments: string[];
  };
}

const STORAGE_BUCKET = 'backups';
const HISTORY_KEY = 'guaranesia_backup_history';
const LAST_BACKUP_KEY = 'guaranesia_last_backup_date';

/**
 * Executes a full backup to Supabase Storage, Supabase DB tables, and local failover snapshot.
 */
export async function performBackup(
  data: {
    tickets: Ticket[];
    equipment: Equipment[];
    technicians: Technician[];
    departments: string[];
  },
  isManual = false
): Promise<{
  success: boolean;
  filename: string;
  timestamp: string;
  supabaseSynced: boolean;
  message: string;
}> {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const filename = `backup_guaranesia_${dateStr}_${timeStr}.json`;
  const backupId = `bkp-${Date.now()}`;

  const payload: BackupPayload = {
    version: '1.0',
    system: 'Prefeitura Municipal de Guaranésia - SCM',
    timestamp: now.toISOString(),
    counts: {
      tickets: data.tickets.length,
      equipment: data.equipment.length,
      technicians: data.technicians.length,
      departments: data.departments.length
    },
    data: {
      tickets: data.tickets,
      equipment: data.equipment,
      technicians: data.technicians,
      departments: data.departments
    }
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const sizeBytes = new Blob([jsonString]).size;
  let supabaseSynced = false;
  let supabaseError: string | null = null;

  // 1. Attempt Supabase Sync (Storage Bucket + system_backups Table)
  if (isSupabaseConfigured && supabase) {
    try {
      // A. Upload JSON file to Supabase Storage bucket 'backups'
      const jsonBlob = new Blob([jsonString], { type: 'application/json' });
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(`daily/${filename}`, jsonBlob, {
          contentType: 'application/json',
          upsert: true
        });

      if (storageError) {
        console.warn('Supabase storage upload notice:', storageError.message);
      }

      // B. Insert metadata record in 'system_backups' table
      const { error: tableError } = await supabase
        .from('system_backups')
        .insert({
          id: backupId,
          filename,
          backup_type: isManual ? 'Backup Manual (Administrador)' : 'Rotina Diária Automática',
          tickets_count: data.tickets.length,
          equipment_count: data.equipment.length,
          technicians_count: data.technicians.length,
          departments_count: data.departments.length,
          payload_json: payload,
          created_at: now.toISOString()
        });

      if (!tableError) {
        supabaseSynced = true;
      } else {
        supabaseError = tableError.message;
        console.warn('Supabase backup table insert notice:', tableError.message);
      }
    } catch (err: any) {
      supabaseError = err.message || 'Erro de conexão com o Supabase';
      console.warn('Supabase connection error during backup:', err);
    }
  }

  // 2. Persist local snapshot & update last daily backup marker
  try {
    localStorage.setItem(LAST_BACKUP_KEY, dateStr);
    localStorage.setItem('guaranesia_daily_backup_snapshot', jsonString);

    // Save to local backup history list (keep up to 30 most recent backups)
    const existingHistory = getLocalBackupHistory();
    const newRecord: BackupRecord = {
      id: backupId,
      filename,
      backupType: isManual ? 'Manual' : 'Rotina Diária',
      timestamp: now.toISOString(),
      ticketsCount: data.tickets.length,
      equipmentCount: data.equipment.length,
      techniciansCount: data.technicians.length,
      departmentsCount: data.departments.length,
      supabaseSynced,
      sizeBytes
    };

    const updatedHistory = [newRecord, ...existingHistory.filter(h => h.id !== backupId)].slice(0, 30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
  } catch (localErr) {
    console.error('Error saving local backup cache:', localErr);
  }

  // Return status
  return {
    success: true,
    filename,
    timestamp: now.toISOString(),
    supabaseSynced,
    message: supabaseSynced
      ? `Backup diário concluído com sucesso e sincronizado no Supabase!`
      : isSupabaseConfigured
      ? `Backup gerado com sucesso localmente. Aviso Supabase: ${supabaseError || 'Tabela de backup pendente'}.`
      : `Backup diário gerado e armazenado com segurança localmente (Supabase aguardando credenciais).`
  };
}

/**
 * Checks if a backup has already been performed today. If not, runs automatic daily routine.
 */
export async function checkAndRunDailyScheduledBackup(data: {
  tickets: Ticket[];
  equipment: Equipment[];
  technicians: Technician[];
  departments: string[];
}): Promise<{ ran: boolean; result?: any }> {
  if (typeof window === 'undefined') return { ran: false };

  const todayStr = new Date().toISOString().split('T')[0];
  const lastBackupStr = localStorage.getItem(LAST_BACKUP_KEY);

  // If already backed up today, skip automatic duplicate run
  if (lastBackupStr === todayStr) {
    return { ran: false };
  }

  // Run automatic daily backup routine
  const result = await performBackup(data, false);
  return { ran: true, result };
}

export function getLocalBackupHistory(): BackupRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

export function getLastBackupDate(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_BACKUP_KEY);
}

/**
 * Generates an instant downloadable JSON file of the current system data.
 */
export function downloadBackupFile(data: {
  tickets: Ticket[];
  equipment: Equipment[];
  technicians: Technician[];
  departments: string[];
}) {
  const dateStr = new Date().toISOString().split('T')[0];
  const payload: BackupPayload = {
    version: '1.0',
    system: 'Prefeitura Municipal de Guaranésia - SCM',
    timestamp: new Date().toISOString(),
    counts: {
      tickets: data.tickets.length,
      equipment: data.equipment.length,
      technicians: data.technicians.length,
      departments: data.departments.length
    },
    data
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_guaranesia_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
