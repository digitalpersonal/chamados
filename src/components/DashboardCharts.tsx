/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  BarChart3, PieChart as PieChartIcon, CheckCircle2, Building2, 
  Flame, Layers, BarChart2, ShieldAlert
} from 'lucide-react';
import { Ticket } from '../App';

interface DashboardChartsProps {
  tickets: Ticket[];
  departments: string[];
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const SECTOR_COLORS = [
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // purple-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#f97316', // orange-500
  '#64748b', // slate-500
];

export default function DashboardCharts({ tickets, departments }: DashboardChartsProps) {
  // Chart visual mode for Active Demands: 'total' (single highlighted bar) or 'status' (stacked by Aberto / Andamento / Peças)
  const [activeChartMode, setActiveChartMode] = useState<'total' | 'status'>('total');

  // 1. Data for Active Tickets by Sector (sorted descending to highlight highest demand)
  const { activeSectorData, totalActiveTickets, topActiveSector } = useMemo(() => {
    const counts: Record<string, { totalActive: number; abertos: number; emAndamento: number; aguardandoPecas: number }> = {};

    // Collect all departments known from props or tickets
    const allDepts = new Set<string>();
    departments.forEach(d => { if (d) allDepts.add(d); });
    tickets.forEach(t => { if (t.department) allDepts.add(t.department); });

    allDepts.forEach(dept => {
      counts[dept] = { totalActive: 0, abertos: 0, emAndamento: 0, aguardandoPecas: 0 };
    });

    let totalActive = 0;

    tickets.forEach(ticket => {
      const isAct = ticket.status === 'Aberto' || ticket.status === 'Em Andamento' || ticket.status === 'Aguardando Peças';
      if (!isAct) return;

      totalActive += 1;
      const dept = ticket.department || 'Outros';
      if (!counts[dept]) {
        counts[dept] = { totalActive: 0, abertos: 0, emAndamento: 0, aguardandoPecas: 0 };
      }
      counts[dept].totalActive += 1;
      if (ticket.status === 'Aberto') {
        counts[dept].abertos += 1;
      } else if (ticket.status === 'Em Andamento') {
        counts[dept].emAndamento += 1;
      } else if (ticket.status === 'Aguardando Peças') {
        counts[dept].aguardandoPecas += 1;
      }
    });

    const list = Object.entries(counts)
      .filter(([_, stats]) => stats.totalActive > 0)
      .map(([name, stats]) => {
        let shortName = name;
        if (name.startsWith('Secretaria de ')) {
          shortName = name.replace('Secretaria de ', 'Sec. ');
        } else if (name.startsWith('Secretaria da ')) {
          shortName = name.replace('Secretaria da ', 'Sec. ');
        } else if (name.startsWith('Secretaria do ')) {
          shortName = name.replace('Secretaria do ', 'Sec. ');
        } else if (name.startsWith('Departamento de ')) {
          shortName = name.replace('Departamento de ', 'Dep. ');
        }
        return {
          name,
          shortName: shortName.length > 20 ? shortName.slice(0, 19) + '…' : shortName,
          totalActive: stats.totalActive,
          abertos: stats.abertos,
          emAndamento: stats.emAndamento,
          aguardandoPecas: stats.aguardandoPecas,
        };
      })
      .sort((a, b) => b.totalActive - a.totalActive);

    const top = list.length > 0 ? list[0] : null;

    return {
      activeSectorData: list,
      totalActiveTickets: totalActive,
      topActiveSector: top
    };
  }, [tickets, departments]);

  // 2. Data for Resolved Tickets per Month (Last 6 Months)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { monthKey: string; label: string; resolvidos: number; total: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthIdx = d.getMonth();
      const label = `${MONTH_NAMES[monthIdx]}/${String(year).slice(-2)}`;
      const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;

      months.push({
        monthKey,
        label,
        resolvidos: 0,
        total: 0
      });
    }

    tickets.forEach(ticket => {
      const ticketDate = new Date(ticket.createdAt);
      if (isNaN(ticketDate.getTime())) return;

      const ticketMonthKey = `${ticketDate.getFullYear()}-${String(ticketDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = months.find(m => m.monthKey === ticketMonthKey);
      if (entry) {
        entry.total += 1;
        if (ticket.status === 'Resolvido' || ticket.status === 'Fechado') {
          entry.resolvidos += 1;
        }
      }
    });

    return months;
  }, [tickets]);

  // 3. Data for Overall Distribution of Tickets by Sector / Department
  const sectorData = useMemo(() => {
    const counts: Record<string, number> = {};

    tickets.forEach(t => {
      const dept = t.department || 'Outros';
      counts[dept] = (counts[dept] || 0) + 1;
    });

    const data = Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return data;
  }, [tickets]);

  const totalResolved = useMemo(() => {
    return tickets.filter(t => t.status === 'Resolvido' || t.status === 'Fechado').length;
  }, [tickets]);

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Desempenho Administrativo & Indicadores</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Acompanhamento de chamados ativos por secretaria, resoluções mensais e demanda global.
          </p>
        </div>
      </div>

      {/* FEATURED CHART: Chamados Ativos por Secretaria / Setor (com identificação da maior demanda) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm min-w-0 max-w-full overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3 pb-3 border-b border-slate-900">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm sm:text-base text-white truncate">
                  Chamados Ativos por Secretaria / Setor
                </h4>
                {topActiveSector && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                    Líder: {topActiveSector.name}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 block truncate">
                Ranking em tempo real das secretarias com maior quantidade de solicitações em aberto ou em atendimento
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveChartMode('total')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeChartMode === 'total'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Total Ativos
              </button>
              <button
                type="button"
                onClick={() => setActiveChartMode('status')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  activeChartMode === 'status'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Por Status
              </button>
            </div>

            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/80 shrink-0 font-mono">
              {totalActiveTickets} ativos
            </span>
          </div>
        </div>

        {activeSectorData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-4">
            <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400 mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h5 className="text-sm font-bold text-white">Nenhum chamado ativo no momento!</h5>
            <p className="text-xs text-slate-400 max-w-md mt-1">
              Todas as secretarias e setores municipais estão com as solicitações 100% resolvidas ou arquivadas.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Bar Chart Container */}
            <div className="lg:col-span-7 flex flex-col min-w-0 max-w-full">
              <div className="h-72 sm:h-80 w-full min-w-0 max-w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={activeSectorData.slice(0, 8)}
                    margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis 
                      type="number" 
                      stroke="#64748b" 
                      fontSize={11} 
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={{ stroke: '#334155' }}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="shortName" 
                      stroke="#94a3b8" 
                      fontSize={11} 
                      width={115} 
                      tickLine={false} 
                      axisLine={{ stroke: '#334155' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        color: '#f8fafc',
                        fontSize: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)'
                      }}
                      itemStyle={{ color: '#f8fafc' }}
                      cursor={{ fill: 'rgba(51, 65, 85, 0.3)' }}
                      labelFormatter={(_, payload) => {
                        if (payload && payload[0] && payload[0].payload) {
                          return payload[0].payload.name;
                        }
                        return '';
                      }}
                      formatter={(val: any, name: any) => [`${val} chamado(s)`, name]}
                    />

                    {activeChartMode === 'total' ? (
                      <Bar 
                        dataKey="totalActive" 
                        name="Chamados Ativos" 
                        radius={[0, 6, 6, 0]}
                        maxBarSize={26}
                      >
                        {activeSectorData.slice(0, 8).map((_, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? '#f59e0b' : index === 1 ? '#0284c7' : '#0ea5e9'} 
                          />
                        ))}
                      </Bar>
                    ) : (
                      <>
                        <Legend 
                          wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                          iconType="circle"
                        />
                        <Bar 
                          dataKey="abertos" 
                          name="Aberto" 
                          stackId="statusStack" 
                          fill="#f59e0b" 
                          maxBarSize={26} 
                        />
                        <Bar 
                          dataKey="emAndamento" 
                          name="Em Andamento" 
                          stackId="statusStack" 
                          fill="#3b82f6" 
                          maxBarSize={26} 
                        />
                        <Bar 
                          dataKey="aguardandoPecas" 
                          name="Aguardando Peças" 
                          stackId="statusStack" 
                          fill="#a855f7" 
                          radius={[0, 6, 6, 0]}
                          maxBarSize={26} 
                        />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-900 mt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shrink-0" />
                  Barra dourada destaca a secretaria com maior volume ativo
                </span>
                <span className="text-amber-400 font-medium">Exibindo Top {Math.min(activeSectorData.length, 8)}</span>
              </div>
            </div>

            {/* Right Side: Leader Highlight & Full Sector Ranking */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-3 min-w-0">
              {/* Leader Highlight Box */}
              {topActiveSector && (
                <div className="bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 rounded-xl p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
                      <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                      Setor com Maior Demanda
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                      #1 em Ativos
                    </span>
                  </div>

                  <div className="text-sm sm:text-base font-bold text-white leading-snug truncate" title={topActiveSector.name}>
                    {topActiveSector.name}
                  </div>

                  <p className="text-xs text-amber-200/80 mt-1">
                    Registra <span className="font-bold text-amber-300 font-mono text-sm">{topActiveSector.totalActive}</span> chamado(s) ativo(s), correspondendo a <span className="font-bold text-amber-300 font-mono">{totalActiveTickets > 0 ? ((topActiveSector.totalActive / totalActiveTickets) * 100).toFixed(0) : 0}%</span> de toda a demanda pendente do município.
                  </p>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-amber-500/20 text-center">
                    <div className="bg-slate-900/80 rounded-lg p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block truncate">Abertos</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">{topActiveSector.abertos}</span>
                    </div>
                    <div className="bg-slate-900/80 rounded-lg p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block truncate">Andamento</span>
                      <span className="font-mono font-bold text-blue-400 text-sm">{topActiveSector.emAndamento}</span>
                    </div>
                    <div className="bg-slate-900/80 rounded-lg p-1.5 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block truncate">Aguard. Peça</span>
                      <span className="font-mono font-bold text-purple-400 text-sm">{topActiveSector.aguardandoPecas}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Ranking List */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  <span>Ranking de Secretarias Ativas</span>
                  <span>Qtd. (% Total)</span>
                </div>
                <div className="space-y-1 max-h-44 sm:max-h-48 overflow-y-auto pr-1">
                  {activeSectorData.map((sec, idx) => {
                    const pct = totalActiveTickets > 0 ? ((sec.totalActive / totalActiveTickets) * 100).toFixed(0) : 0;
                    const isTop = idx === 0;
                    return (
                      <div 
                        key={sec.name} 
                        className={`flex items-center justify-between text-xs p-2 rounded-lg border transition-colors ${
                          isTop 
                            ? 'bg-amber-950/30 border-amber-500/40' 
                            : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                            isTop 
                              ? 'bg-amber-500 text-slate-950 font-black ring-1 ring-amber-400' 
                              : 'bg-slate-800 text-slate-300'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className="text-slate-200 font-medium truncate text-[11px]" title={sec.name}>
                            {sec.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2 font-mono text-[11px]">
                          <span className={`font-bold ${isTop ? 'text-amber-400' : 'text-white'}`}>
                            {sec.totalActive}
                          </span>
                          <span className="text-slate-500 text-[10px]">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECONDARY ROW: Resolvidos por Mês & Distribuição Geral de Chamados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0 max-w-full">
        {/* Chart 1: Resolved tickets by month */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between min-w-0 max-w-full overflow-hidden">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-white truncate">Chamados Resolvidos por Mês</h4>
                <span className="text-[11px] text-slate-400 block truncate">Últimos 6 meses de atendimento</span>
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
              Total: {totalResolved}
            </span>
          </div>

          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={11} 
                  allowDecimals={false}
                  tickLine={false} 
                  axisLine={{ stroke: '#334155' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                    fontSize: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                  }}
                  itemStyle={{ color: '#34d399' }}
                  cursor={{ fill: 'rgba(51, 65, 85, 0.3)' }}
                  formatter={(value: any) => [`${value} chamados`, 'Resolvidos']}
                />
                <Bar 
                  dataKey="resolvidos" 
                  name="Resolvidos" 
                  fill="#10b981" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-900 mt-2">
            <span>Métrica de eficiência do suporte técnico</span>
            <span className="text-emerald-400 font-medium">Meta: 100% resolutividade</span>
          </div>
        </div>

        {/* Chart 2: Distribution of total tickets by Sector */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between min-w-0 max-w-full overflow-hidden">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-sm text-white truncate">Distribuição Total por Setor</h4>
                <span className="text-[11px] text-slate-400 block truncate">Demanda histórica acumulada</span>
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 shrink-0">
              {sectorData.length} setores
            </span>
          </div>

          {sectorData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-4">
              <PieChartIcon className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 font-medium">Nenhum chamado registrado ainda.</p>
              <p className="text-[11px] text-slate-500 mt-1">Os dados do gráfico serão gerados automaticamente conforme os setores abrirem solicitações.</p>
            </div>
          ) : (
            <div className="h-64 w-full min-w-0 max-w-full flex flex-col sm:flex-row items-center justify-center">
              <div className="w-full sm:w-1/2 h-44 sm:h-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {sectorData.map((_, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={SECTOR_COLORS[index % SECTOR_COLORS.length]} 
                          stroke="#0f172a"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        color: '#f8fafc',
                        fontSize: '12px'
                      }}
                      formatter={(value: any, name: any) => [`${value} chamados`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Top sectors list */}
              <div className="w-full sm:w-1/2 max-h-56 overflow-y-auto space-y-1.5 pr-2 mt-2 sm:mt-0">
                {sectorData.slice(0, 6).map((item, index) => {
                  const percentage = tickets.length > 0 ? ((item.value / tickets.length) * 100).toFixed(0) : 0;
                  return (
                    <div key={item.name} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-900/60">
                      <div className="flex items-center gap-2 min-w-0">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length] }} 
                        />
                        <span className="text-slate-300 truncate font-medium text-[11px]" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2 font-mono text-[11px]">
                        <span className="text-white font-bold">{item.value}</span>
                        <span className="text-slate-500">({percentage}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-900 mt-2">
            <span>Secretarias com maior número histórico de manutenções</span>
            <span className="text-cyan-400 font-medium">Histórico acumulado</span>
          </div>
        </div>
      </div>
    </div>
  );
}
