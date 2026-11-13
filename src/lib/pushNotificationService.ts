/**
 * Serviço de Notificações Push via Navegador + API de Service Workers (Web Push / VAPID).
 * Permite alertar profissionais instantaneamente sobre novos agendamentos e chamados,
 * persistindo os alertas mesmo quando a aba ou o navegador estiverem fechados.
 */

export type PushRole = 'admin' | 'technician';

export interface PushMetadata {
  role: PushRole;
  technicianId?: string;
  technicianName?: string;
  deviceLabel?: string;
}

export interface PushStatusSummary {
  configured: boolean;
  totalSubscriptions: number;
  adminCount: number;
  technicianCount: number;
  currentEndpointSubscribed: boolean;
}

const PUSH_PREF_KEY = 'guaranesia_push_enabled_pref';

export function isPushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getSavedPushPreference(): boolean {
  try {
    return localStorage.getItem(PUSH_PREF_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function setSavedPushPreference(enabled: boolean) {
  try {
    localStorage.setItem(PUSH_PREF_KEY, enabled ? 'true' : 'false');
  } catch (e) {}
}

/**
 * Registra o Service Worker (/sw.js) responsável por receber alertas Push em segundo plano.
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn('Falha ao registrar Service Worker:', err);
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn('Erro ao verificar inscrição Push existente:', err);
    return null;
  }
}

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Navegador';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Celular Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad';
  if (/Edg/i.test(ua)) return 'Microsoft Edge (Desktop)';
  if (/Chrome/i.test(ua)) return 'Google Chrome (Desktop)';
  if (/Firefox/i.test(ua)) return 'Mozilla Firefox (Desktop)';
  if (/Safari/i.test(ua)) return 'Safari (Desktop)';
  return 'Navegador Web';
}

/**
 * Solicita permissão ao navegador, registra o Service Worker e inscreve o dispositivo
 * no servidor Web Push (VAPID) para receber alertas mesmo com a aba fechada.
 */
export async function subscribeToWebPush(metadata: PushMetadata): Promise<{
  success: boolean;
  subscription?: PushSubscription;
  permission?: NotificationPermission | 'unsupported';
  error?: string;
}> {
  if (!isPushSupported()) {
    return {
      success: false,
      permission: 'unsupported',
      error: 'Este navegador não suporta Service Workers ou Web Push API.'
    };
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        error:
          permission === 'denied'
            ? 'As notificações foram bloqueadas nas configurações do navegador. Libere o cadeado ao lado da URL para permitir alertas.'
            : 'Permissão de notificação não concedida pelo usuário.'
      };
    }

    const registration = await registerPushServiceWorker();
    if (!registration) {
      return {
        success: false,
        permission,
        error: 'Não foi possível registrar o Service Worker (/sw.js) em segundo plano.'
      };
    }

    // Busca a chave pública VAPID gerada pelo servidor
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) {
      throw new Error('Servidor de notificações Push indisponível.');
    }
    const keyData = await keyRes.json();
    if (!keyData.success || !keyData.publicKey) {
      throw new Error(keyData.error || 'Chave pública VAPID não configurada no servidor.');
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });
    }

    // Registra a inscrição no servidor
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        role: metadata.role,
        technicianId: metadata.technicianId || null,
        technicianName: metadata.technicianName || null,
        deviceLabel: metadata.deviceLabel || detectDeviceLabel()
      })
    });

    if (!saveRes.ok) {
      const errData = await saveRes.json().catch(() => ({}));
      throw new Error(errData.error || 'Erro ao salvar inscrição Push no servidor.');
    }

    setSavedPushPreference(true);
    return { success: true, subscription, permission };
  } catch (err: any) {
    console.error('Erro ao inscrever no Web Push:', err);
    return {
      success: false,
      permission: getNotificationPermissionState(),
      error: err?.message || 'Erro desconhecido ao ativar notificações Push.'
    };
  }
}

/**
 * Atualiza os metadados do profissional inscrito (ex: técnico que acabou de fazer login).
 */
export async function syncPushSubscriptionMetadata(metadata: PushMetadata): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const subscription = await getExistingPushSubscription();
    if (!subscription) return false;

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        role: metadata.role,
        technicianId: metadata.technicianId || null,
        technicianName: metadata.technicianName || null,
        deviceLabel: metadata.deviceLabel || detectDeviceLabel()
      })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function unsubscribeFromWebPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const subscription = await getExistingPushSubscription();
    if (subscription) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => {});
      await subscription.unsubscribe();
    }
    setSavedPushPreference(false);
    return true;
  } catch (err) {
    console.warn('Erro ao cancelar inscrição Push:', err);
    return false;
  }
}

export async function fetchPushStatus(): Promise<PushStatusSummary | null> {
  try {
    const existing = await getExistingPushSubscription();
    const res = await fetch('/api/push/status');
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    return {
      configured: Boolean(data.configured),
      totalSubscriptions: data.totalSubscriptions || 0,
      adminCount: data.adminCount || 0,
      technicianCount: data.technicianCount || 0,
      currentEndpointSubscribed: Boolean(
        existing &&
          Array.isArray(data.endpoints) &&
          data.endpoints.includes(existing.endpoint)
      )
    };
  } catch (e) {
    return null;
  }
}

export async function sendTestWebPush(options: {
  delaySeconds?: number;
  role?: PushRole;
  technicianId?: string;
  onlyCurrentDevice?: boolean;
}): Promise<{ success: boolean; sentCount?: number; message?: string; error?: string }> {
  try {
    const existing = await getExistingPushSubscription();
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: options.onlyCurrentDevice && existing ? existing.endpoint : undefined,
        delaySeconds: options.delaySeconds || 0,
        role: options.role,
        technicianId: options.technicianId
      })
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao enviar teste Push.' };
  }
}

/**
 * Exibe uma notificação persistente usando o Service Worker ativo (para eventos SSE/Realtime).
 */
export async function showPersistentSwNotification(payload: {
  title: string;
  body: string;
  ticketId?: string;
  code?: string;
  url?: string;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const registration = await registerPushServiceWorker();
    if (registration) {
      const swOptions: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
        body: payload.body,
        icon: '/icon-notificacao.svg',
        badge: '/icon-notificacao.svg',
        tag: payload.ticketId ? `ticket-${payload.ticketId}` : `alert-${Date.now()}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [250, 100, 250],
        data: {
          url: payload.url || '/?portal=tecnico',
          ticketId: payload.ticketId || null,
          code: payload.code || null
        }
      };
      await registration.showNotification(payload.title, swOptions);
      return true;
    }
  } catch (err) {
    console.warn('Fallback para Notification padrão:', err);
  }

  try {
    new Notification(payload.title, {
      body: payload.body,
      icon: '/icon-notificacao.svg'
    });
    return true;
  } catch (e) {
    return false;
  }
}
