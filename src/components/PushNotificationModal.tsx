/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  BellRing, BellOff, CheckCircle2, AlertTriangle, ShieldCheck,
  Radio, Smartphone, Send, Clock, X, ExternalLink, RefreshCw
} from 'lucide-react';
import {
  PushRole,
  PushStatusSummary,
  isPushSupported,
  isRunningInIframe,
  getNotificationPermissionState,
  getExistingPushSubscription,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  fetchPushStatus,
  sendTestWebPush,
  registerPushServiceWorker
} from '../lib/pushNotificationService';

interface PushNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: PushRole;
  technicianId?: string;
  technicianName?: string;
  onStatusChange?: (isSubscribed: boolean) => void;
}

export default function PushNotificationModal({
  isOpen,
  onClose,
  role,
  technicianId,
  technicianName,
  onStatusChange
}: PushNotificationModalProps) {
  const [supported] = useState(() => isPushSupported());
  const [inIframe] = useState(() => isRunningInIframe());
  const [permission, setPermission] = useState(() => getNotificationPermissionState());
  const [swActive, setSwActive] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [serverStatus, setServerStatus] = useState<PushStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const refreshAllStatus = async () => {
    setPermission(getNotificationPermissionState());
    try {
      const reg = await registerPushServiceWorker();
      setSwActive(Boolean(reg && (reg.active || reg.installing || reg.waiting)));
      const sub = await getExistingPushSubscription();
      const subActive = Boolean(sub);
      setIsSubscribed(subActive);
      if (onStatusChange) onStatusChange(subActive);
      const srv = await fetchPushStatus();
      setServerStatus(srv);
    } catch (e) {
      console.warn('Erro ao atualizar status Push:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFeedback(null);
      refreshAllStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      if (countdown === 0) setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  if (!isOpen) return null;

  const handleActivatePush = async () => {
    setIsLoading(true);
    setFeedback(null);
    const result = await subscribeToWebPush({
      role,
      technicianId,
      technicianName
    });
    setIsLoading(false);

    if (result.success) {
      setFeedback({
        type: 'success',
        text: 'Notificações Push ativadas! Este dispositivo receberá alertas instantâneos de novos agendamentos e chamados mesmo com a aba fechada.'
      });
      await refreshAllStatus();
    } else {
      setFeedback({
        type: 'error',
        text: result.error || 'Não foi possível ativar as notificações Push.'
      });
      setPermission(getNotificationPermissionState());
    }
  };

  const handleDeactivatePush = async () => {
    setIsLoading(true);
    setFeedback(null);
    await unsubscribeFromWebPush();
    setIsLoading(false);
    setFeedback({
      type: 'info',
      text: 'Alertas Push em segundo plano desativados para este navegador.'
    });
    await refreshAllStatus();
  };

  const handleTestImmediate = async () => {
    setIsLoading(true);
    setFeedback(null);
    const res = await sendTestWebPush({
      delaySeconds: 0,
      role,
      technicianId,
      onlyCurrentDevice: true
    });
    setIsLoading(false);

    if (res.success) {
      setFeedback({
        type: 'success',
        text: res.message || 'Notificação de teste enviada via Service Worker!'
      });
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Falha ao disparar teste Push. Verifique se o dispositivo está inscrito.'
      });
    }
  };

  const handleTestClosedTab = async () => {
    setIsLoading(true);
    setFeedback(null);
    const res = await sendTestWebPush({
      delaySeconds: 5,
      role,
      technicianId,
      onlyCurrentDevice: true
    });
    setIsLoading(false);

    if (res.success) {
      setCountdown(5);
      setFeedback({
        type: 'info',
        text: 'Alerta agendado para 5 segundos! Feche esta aba agora (mantendo o navegador em execução) para comprovar a persistência via Service Worker.'
      });
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Não foi possível agendar o teste em segundo plano.'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
              isSubscribed && permission === 'granted'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            }`}>
              <BellRing className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg text-white truncate">
                Alertas Push em Segundo Plano
              </h3>
              <p className="text-xs text-slate-400 truncate">
                Service Worker Web Push • Notificações com a aba fechada
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {/* Diagnostic Status Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center gap-3">
              <Radio className={`w-5 h-5 shrink-0 ${swActive ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <span className="text-slate-400 block text-[11px]">Service Worker (/sw.js)</span>
                <span className={`font-bold ${swActive ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {swActive ? 'Ativo em Segundo Plano' : 'Não Registrado'}
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center gap-3">
              <ShieldCheck className={`w-5 h-5 shrink-0 ${
                permission === 'granted' ? 'text-emerald-400' : permission === 'denied' ? 'text-rose-400' : 'text-amber-400'
              }`} />
              <div>
                <span className="text-slate-400 block text-[11px]">Permissão do Navegador</span>
                <span className={`font-bold ${
                  permission === 'granted' ? 'text-emerald-400' : permission === 'denied' ? 'text-rose-400' : 'text-amber-300'
                }`}>
                  {permission === 'granted'
                    ? 'Concedida'
                    : permission === 'denied'
                    ? 'Bloqueada no Navegador'
                    : permission === 'unsupported'
                    ? 'Não Suportada'
                    : 'Aguardando Autorização'}
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center gap-3">
              <Smartphone className={`w-5 h-5 shrink-0 ${isSubscribed ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <span className="text-slate-400 block text-[11px]">Este Dispositivo</span>
                <span className={`font-bold ${isSubscribed ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {isSubscribed ? 'Inscrito (VAPID Ativo)' : 'Não Inscrito'}
                </span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center gap-3">
              <BellRing className="w-5 h-5 shrink-0 text-cyan-400" />
              <div>
                <span className="text-slate-400 block text-[11px]">Profissionais Conectados</span>
                <span className="font-bold text-white">
                  {serverStatus
                    ? `${serverStatus.totalSubscriptions} dispositivo(s) (${serverStatus.technicianCount} téc. / ${serverStatus.adminCount} adm.)`
                    : 'Carregando...'}
                </span>
              </div>
            </div>
          </div>

          {/* Embedded iframe warning */}
          {inIframe && permission !== 'granted' && (
            <div className="bg-amber-950/50 border border-amber-500/40 rounded-2xl p-3.5 text-xs text-amber-200 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300 block">Navegador em modo incorporado (iframe):</strong>
                  <span className="text-amber-200/90">
                    Alguns navegadores bloqueiam solicitações de Notificação Push dentro de painéis incorporados. Se o botão abaixo não solicitar permissão, abra o sistema diretamente em uma nova guia do navegador.
                  </span>
                </div>
              </div>
              <a
                href={typeof window !== 'undefined' ? window.location.href : '/'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-[11px] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir em Nova Guia do Navegador</span>
              </a>
            </div>
          )}

          {/* Browser unsupported notice */}
          {!supported && (
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-3.5 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-300 block">Navegador incompatível com Web Push</strong>
                <span>
                  Utilize Chrome, Edge, Firefox ou Safari (iOS 16.4+ adicionado à Tela de Início) em conexão HTTPS/localhost.
                </span>
              </div>
            </div>
          )}

          {/* Feedback banner */}
          {feedback && (
            <div className={`rounded-2xl p-3.5 text-xs border flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : feedback.type === 'error'
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                : 'bg-cyan-950/60 border-cyan-500/50 text-cyan-200'
            }`}>
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : feedback.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <p>{feedback.text}</p>
                {countdown !== null && countdown > 0 && (
                  <p className="font-mono font-bold text-cyan-300">
                    Disparo automático em {countdown}s...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* How it works box */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-300 space-y-1.5">
            <strong className="text-white block">Como funciona para o profissional:</strong>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Ao surgir um novo agendamento/chamado (ou ao ser atribuído a você), o servidor envia um evento criptografado via Web Push (VAPID).</li>
              <li>O Service Worker (<code className="text-emerald-400 font-mono">/sw.js</code>) acorda em segundo plano mesmo com a aba fechada e fixa o alerta na tela do sistema.</li>
              <li>Ao clicar na notificação, o navegador abre diretamente o painel no chamado correspondente.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            {(!isSubscribed || permission !== 'granted') ? (
              <button
                type="button"
                disabled={isLoading || !supported}
                onClick={handleActivatePush}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <BellRing className="w-4 h-4" />
                )}
                <span>Ativar Alertas Push (Funciona com Aba Fechada)</span>
              </button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleTestImmediate}
                  className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Testar Alerta Agora</span>
                </button>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleTestClosedTab}
                  className="py-2.5 px-4 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-200 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Testar com Aba Fechada (5s)</span>
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              {isSubscribed ? (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleDeactivatePush}
                  className="px-3 py-2 text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/50 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  <span>Desativar neste dispositivo</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={refreshAllStatus}
                  className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Verificar novamente</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors ml-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
