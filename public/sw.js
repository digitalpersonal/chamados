/* eslint-disable no-restricted-globals */
// Service Worker oficial para Notificações Push em Segundo Plano
// Prefeitura Municipal de Guaranésia - Controle de Chamados e Agendamentos

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Recebe eventos Push diretamente do servidor mesmo com a aba ou navegador fechados
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Novo Agendamento / Chamado Recebido',
    body: 'Um novo atendimento foi registrado no sistema.',
    tag: 'guaranesia-ticket-alert',
    url: '/?portal=tecnico',
    ticketId: null,
    code: null,
    department: null,
    priority: null,
    timestamp: Date.now()
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch (e) {
      const rawText = event.data.text();
      if (rawText) {
        payload.body = rawText;
      }
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: '/icon-notificacao.svg',
    badge: '/icon-notificacao.svg',
    tag: payload.tag || `ticket-${payload.ticketId || Date.now()}`,
    renotify: true,
    requireInteraction: true, // Mantém o alerta persistente até interação do profissional
    vibrate: [250, 100, 250, 100, 350],
    timestamp: payload.timestamp || Date.now(),
    data: {
      url: payload.url || '/?portal=tecnico',
      ticketId: payload.ticketId || null,
      code: payload.code || null
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir Atendimento'
      },
      {
        action: 'dismiss',
        title: 'Dispensar'
      }
    ]
  };

  const showPromise = self.registration.showNotification(payload.title, notificationOptions);

  // Também avisa quaisquer abas já abertas para atualização instantânea e alerta sonoro
  const notifyClientsPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({
          type: 'PUSH_RECEIVED',
          payload
        });
      });
    });

  event.waitUntil(Promise.all([showPromise, notifyClientsPromise]));
});

// Permite exibir notificações persistentes via Service Worker a partir de mensagens do app
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'SHOW_LOCAL_NOTIFICATION' && data.payload) {
    const p = data.payload;
    event.waitUntil(
      self.registration.showNotification(p.title || 'Novo Chamado / Agendamento', {
        body: p.body || 'Novo atendimento registrado.',
        icon: '/icon-notificacao.svg',
        badge: '/icon-notificacao.svg',
        tag: p.tag || `local-${p.ticketId || Date.now()}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [250, 100, 250],
        data: {
          url: p.url || '/?portal=tecnico',
          ticketId: p.ticketId || null,
          code: p.code || null
        },
        actions: [
          { action: 'open', title: 'Abrir Atendimento' },
          { action: 'dismiss', title: 'Dispensar' }
        ]
      })
    );
  }
});

// Ao clicar na notificação, foca uma aba existente ou abre uma nova aba diretamente no chamado
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || '/?portal=tecnico';
  const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'OPEN_TICKET',
            ticketId: notificationData.ticketId,
            code: notificationData.code,
            url: targetUrl
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteTargetUrl);
      }
      return undefined;
    })
  );
});
