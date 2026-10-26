import sys

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Find the start of the return statement
start_marker = '  return ('
end_marker = '      {/* Modals */}'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    # I'll rebuild the middle part correctly
    new_return = """  return (
    <div 
      onClick={() => initAudioContext()}
      className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans max-w-[100vw] overflow-x-hidden relative"
    >
      {/* Toast and Alert Banners */}
      {celebrationToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-emerald-950 border-2 border-emerald-400 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3.5 backdrop-blur-md animate-in slide-in-from-top-6 duration-300 ring-4 ring-emerald-500/30">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-300 shrink-0 text-2xl shadow-inner">🎉</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" /> <span>Chamado {celebrationToast.status}!</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-100 font-medium mt-0.5">O chamado <span className="font-mono font-bold text-emerald-300">{celebrationToast.code}</span> foi concluído com sucesso.</p>
          </div>
          <button onClick={() => setCelebrationToast(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 shrink-0">✕</button>
        </div>
      )}

      {deleteToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-slate-950 border-2 border-rose-500/80 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-6 duration-300 ring-4 ring-rose-500/20">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0"><Trash2 className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs sm:text-sm text-slate-200">{deleteToast}</p></div>
          <button onClick={() => setDeleteToast(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 shrink-0">✕</button>
        </div>
      )}

      {liveAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-sm sm:max-w-md w-[calc(100%-2rem)] bg-slate-950 border-2 border-emerald-500 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 backdrop-blur-md animate-in slide-in-from-top-4 duration-300 ring-4 ring-emerald-500/20">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0"><BellRing className="w-5 h-5 animate-bounce" /></div>
              <div><h4 className="text-xs sm:text-sm font-bold text-white mt-0.5 line-clamp-1">{liveAlert.code} - {liveAlert.title}</h4></div>
            </div>
            <button onClick={() => setLiveAlert(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">✕</button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => { setSelectedTicket(liveAlert.ticket); setLiveAlert(null); }} className="flex-1 py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow"><Eye className="w-3.5 h-3.5" /><span>Ver Chamado</span></button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-3 sm:px-6 py-2.5 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 w-full shadow-sm no-print">
        <div className="flex items-center justify-between w-full sm:w-auto gap-2 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shrink-0">MG</div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-white truncate">Prefeitura de Guaranésia</h1>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${isSupabaseReady() ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-slate-800 text-slate-400"}`}>
                  <Database className="w-3 h-3" /> {isSupabaseReady() ? "SUPABASE" : "LOCAL"}
                </span>
                {isSupabaseReady() && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-slate-950">ONLINE</span>}
              </div>
            </div>
          </div>
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            <button onClick={() => { localStorage.removeItem("guaranesia_admin_auth"); setIsAuthenticated(false); }} className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-[11px]"><LogOut className="w-3 h-3" /></button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
          <button onClick={() => syncWithServer(true)} className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 text-emerald-400" />Sincronizar</button>
          <button onClick={() => setIsShareModalOpen(true)} className="px-2.5 py-1.5 text-[11px] font-bold text-sky-400 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" />Link Servidores</button>
          <button onClick={() => { setIsAdminPreview(true); setViewMode("portal"); }} className="px-2.5 py-1.5 text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Visão Servidor</button>
          <button onClick={() => setIsPrintModalOpen(true)} className="px-2.5 py-1.5 text-[11px] font-bold text-slate-200 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-1.5"><Print className="w-3.5 h-3.5 text-emerald-400" />Relatório</button>
          <button onClick={() => setIsCloudSyncModalOpen(true)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border flex items-center gap-1.5 ${isSupabaseReady() ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40" : "bg-slate-900 text-slate-400 border-slate-800"}`}><Cloud className="w-3.5 h-3.5" />{isSupabaseReady() ? "Nuvem Conectada" : "Configurar Nuvem"}</button>
          <button onClick={() => setIsNewTicketOpen(true)} className="px-3 py-1.5 text-[11px] font-bold text-slate-950 bg-emerald-500 rounded-lg flex items-center gap-1.5 shadow-lg"><Plus className="w-3.5 h-3.5" />Novo Chamado</button>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-300 px-6 py-2 bg-slate-900 border-b border-slate-800 no-print">
        {['dashboard', 'tickets', 'equipment', 'departments', 'technicians'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} className={`transition-colors py-1 uppercase text-[10px] font-bold tracking-wider ${activeTab === tab ? "text-emerald-400 border-b-2 border-emerald-500" : "hover:text-white"}`}>
            {tab === 'dashboard' ? 'Painel Geral' : tab === 'tickets' ? `Chamados (${tickets.filter(t => t.status === 'Aberto').length})` : tab === 'equipment' ? 'Inventário' : tab === 'departments' ? 'Setores' : 'Técnicos'}
          </button>
        ))}
      </nav>

      {/* Mobile Tabs */}
      <div className="lg:hidden flex overflow-x-auto bg-slate-950 border-b border-slate-800 px-3 py-2 gap-1.5 no-print">
        {['dashboard', 'tickets', 'equipment', 'departments', 'technicians'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-3 py-1.5 text-[10px] font-bold rounded-md whitespace-nowrap ${activeTab === tab ? "bg-emerald-600 text-white" : "text-slate-400 bg-slate-900"}`}>{tab.toUpperCase()}</button>
        ))}
      </div>

      <main className="flex-1 p-3.5 sm:p-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between text-[10px] px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 flex-wrap gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-emerald-400 font-bold uppercase">PREFEITURA DE GUARANÉSIA (PRODUÇÃO)</span>
                <span className="text-slate-300 font-medium">Modo Produção Oficial: <span className="text-emerald-400 font-extrabold">{tickets.length} chamados salvos</span></span>
              </div>
            </div>

            <div className="mb-8 mt-6">
               <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">Central de Manutenção e Suporte Técnico</h2>
               <p className="text-slate-400 text-sm mt-1.5 max-w-2xl">Gestão de chamados e ativos municipais.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4"><span className="text-xs font-bold text-slate-400">Total</span><div className="text-2xl font-extrabold text-white">{tickets.length}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-blue-400"><span className="text-xs font-bold">Em Atendimento</span><div className="text-2xl font-extrabold text-white">{tickets.filter(t => ['Aberto', 'Em Andamento'].includes(t.status)).length}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-emerald-400"><span className="text-xs font-bold">Resolvidos</span><div className="text-2xl font-extrabold text-white">{tickets.filter(t => t.status === 'Resolvido').length}</div></div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-rose-500"><span className="text-xs font-bold">Críticos</span><div className="text-2xl font-extrabold text-white">{tickets.filter(t => t.priority === 'Crítica').length}</div></div>
            </div>

            <DashboardCharts tickets={tickets} departments={departments} />
          </div>
        )}
        
        {activeTab === 'tickets' && (
          <div className="space-y-6">
             {/* Ticket list logic would go here, I am truncating for the repair script */}
          </div>
        )}
      </main>
"""
    # Wait, I cannot truncate the ticket list. I must preserve the rest of the file.
    # I'll only replace the header and top part.
    
    header_block = """  return (
    <div 
      onClick={() => initAudioContext()}
      className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans max-w-[100vw] overflow-x-hidden relative"
    >
      {/* Toast and Alert Banners */}
      {celebrationToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-emerald-950 border-2 border-emerald-400 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3.5 backdrop-blur-md animate-in slide-in-from-top-6 duration-300 ring-4 ring-emerald-500/30">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-300 shrink-0 text-2xl shadow-inner">🎉</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" /> <span>Chamado {celebrationToast.status}!</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-100 font-medium mt-0.5">O chamado <span className="font-mono font-bold text-emerald-300">{celebrationToast.code}</span> foi concluído com sucesso.</p>
          </div>
          <button onClick={() => setCelebrationToast(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 shrink-0">✕</button>
        </div>
      )}

      {deleteToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-slate-950 border-2 border-rose-500/80 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-top-6 duration-300 ring-4 ring-rose-500/20">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0"><Trash2 className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0"><p className="text-xs sm:text-sm text-slate-200">{deleteToast}</p></div>
          <button onClick={() => setDeleteToast(null)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 shrink-0">✕</button>
        </div>
      )}

      {liveAlert && (
        <div className="fixed top-4 right-4 z-50 max-w-sm sm:max-w-md w-[calc(100%-2rem)] bg-slate-950 border-2 border-emerald-500 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 backdrop-blur-md animate-in slide-in-from-top-4 duration-300 ring-4 ring-emerald-500/20">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0"><BellRing className="w-5 h-5 animate-bounce" /></div>
              <div><h4 className="text-xs sm:text-sm font-bold text-white mt-0.5 line-clamp-1">{liveAlert.code} - {liveAlert.title}</h4></div>
            </div>
            <button onClick={() => setLiveAlert(null)} className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800">✕</button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => { setSelectedTicket(liveAlert.ticket); setLiveAlert(null); }} className="flex-1 py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"><Eye className="w-3.5 h-3.5" /><span>Ver Chamado Agora</span></button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800 px-3 sm:px-6 py-2.5 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 w-full shadow-sm no-print">
        <div className="flex items-center justify-between w-full sm:w-auto gap-2 min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold shrink-0">MG</div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-white truncate">Prefeitura de Guaranésia</h1>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-[10px] text-slate-400 font-medium">Painel Admin</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${isSupabaseReady() ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-slate-800 text-slate-400"}`}>
                  <Database className="w-3 h-3" /> {isSupabaseReady() ? "SUPABASE" : "LOCAL"}
                </span>
                {isSupabaseReady() && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-slate-950">ONLINE</span>}
              </div>
            </div>
          </div>
          <div className="sm:hidden flex items-center gap-1 shrink-0">
            <button onClick={() => { localStorage.removeItem("guaranesia_admin_auth"); setIsAuthenticated(false); }} className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-[11px]"><LogOut className="w-3 h-3" /></button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
          <button onClick={() => syncWithServer(true)} className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 text-emerald-400" />Sincronizar</button>
          <button onClick={() => setIsShareModalOpen(true)} className="px-2.5 py-1.5 text-[11px] font-bold text-sky-400 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" />Link Servidores</button>
          <button onClick={() => { setIsAdminPreview(true); setViewMode("portal"); }} className="px-2.5 py-1.5 text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Visão Servidor</button>
          <button onClick={() => setIsPrintModalOpen(true)} className="px-2.5 py-1.5 text-[11px] font-bold text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 flex items-center gap-1.5"><Print className="w-3.5 h-3.5 text-emerald-400" />Relatório</button>
          <button onClick={() => setIsCloudSyncModalOpen(true)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border flex items-center gap-1.5 ${isSupabaseReady() ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40" : "bg-slate-900 text-slate-400 border-slate-800"}`}><Cloud className="w-3.5 h-3.5" />{isSupabaseReady() ? "Nuvem Conectada" : "Configurar Nuvem"}</button>
          <button onClick={() => setIsNewTicketOpen(true)} className="px-3 py-1.5 text-[11px] font-bold text-slate-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 flex items-center gap-1.5 shadow-lg"><Plus className="w-3.5 h-3.5" />Novo Chamado</button>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-300 px-6 py-2 bg-slate-900 border-b border-slate-800 no-print">
        <button onClick={() => setActiveTab('dashboard')} className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'dashboard' ? "text-emerald-400 font-semibold border-b-2 border-emerald-500" : "hover:text-white"}`}>Painel Geral</button>
        <button onClick={() => setActiveTab('tickets')} className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'tickets' ? "text-emerald-400 font-semibold border-b-2 border-emerald-500" : "hover:text-white"}`}>Chamados</button>
        <button onClick={() => setActiveTab('equipment')} className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'equipment' ? "text-emerald-400 font-semibold border-b-2 border-emerald-500" : "hover:text-white"}`}>Inventário</button>
        <button onClick={() => setActiveTab('departments')} className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'departments' ? "text-emerald-400 font-semibold border-b-2 border-emerald-500" : "hover:text-white"}`}>Setores</button>
        <button onClick={() => setActiveTab('technicians')} className={`transition-colors whitespace-nowrap py-1 ${activeTab === 'technicians' ? "text-emerald-400 font-semibold border-b-2 border-emerald-500" : "hover:text-white"}`}>Técnicos</button>
      </nav>

      {/* Mobile Nav Tabs */}
      <div className="lg:hidden flex overflow-x-auto w-full max-w-full bg-slate-950 border-b border-slate-800 px-3 py-2 gap-1.5 no-print scrollbar-none">
        <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'dashboard' ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 bg-slate-900"}`}>Painel</button>
        <button onClick={() => setActiveTab('tickets')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'tickets' ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 bg-slate-900"}`}>Chamados</button>
        <button onClick={() => setActiveTab('equipment')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'equipment' ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 bg-slate-900"}`}>Inventário</button>
        <button onClick={() => setActiveTab('departments')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'departments' ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 bg-slate-900"}`}>Setores</button>
        <button onClick={() => setActiveTab('technicians')} className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap shrink-0 ${activeTab === 'technicians' ? "bg-emerald-600 text-white font-semibold" : "text-slate-400 bg-slate-900"}`}>Técnicos</button>
      </div>

      <main className="flex-1 p-3.5 sm:p-6 max-w-7xl mx-auto w-full overflow-x-hidden min-w-0">
"""
    # Replace content from return ( up to the start of dashboard tab
    final_content = content[:start_idx] + header_block + content[end_idx:]
    with open('src/App.tsx', 'w') as f:
        f.write(final_content)
else:
    print("Markers not found", start_idx, end_idx)
    sys.exit(1)
