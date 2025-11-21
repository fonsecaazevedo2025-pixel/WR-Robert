
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { BrokerProfile } from '../types';

declare const Chart: any;

interface BrokerManagementProps {
  brokers: BrokerProfile[];
  onAddBroker: (brokerName: string, initialLeads: number, monthlySalesGoal: number) => void;
  onSelectBroker: (brokerName: string) => void;
  onUpdateBroker: (originalName: string, updatedData: { brokerName: string; initialLeads: number; monthlySalesGoal: number }) => boolean;
  onDeleteBroker: (brokerName: string) => void;
  onRestoreBrokers: (brokers: BrokerProfile[]) => void;
  deferredPrompt: any | null;
  onInstallClick: () => void;
}

interface ComparisonData {
  brokerName: string;
  totalNewLeads: number;
  totalSales: number;
  conversionRate: number;
}


const BrokerManagement: React.FC<BrokerManagementProps> = ({ brokers, onAddBroker, onSelectBroker, onUpdateBroker, onDeleteBroker, onRestoreBrokers, deferredPrompt, onInstallClick }) => {
  const [brokerName, setBrokerName] = useState('');
  const [initialLeads, setInitialLeads] = useState<number | ''>('');
  const [monthlySalesGoal, setMonthlySalesGoal] = useState<number | ''>('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ComparisonData; direction: 'ascending' | 'descending' }>({ key: 'totalSales', direction: 'descending' });
  const [editingBroker, setEditingBroker] = useState<BrokerProfile | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedInitialLeads, setEditedInitialLeads] = useState<number | ''>('');
  const [editedMonthlySalesGoal, setEditedMonthlySalesGoal] = useState<number | ''>('');

  const comparisonChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const rankedBrokers = useMemo(() => {
    return brokers
      .map(broker => {
        const totalSales = broker.dailyEntries.reduce((sum, entry) => sum + entry.signedLeads, 0);
        return { ...broker, totalSales };
      })
      .filter(broker => broker.totalSales > 0) // Only rank brokers with actual sales
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [brokers]);

  const comparisonData = useMemo(() => {
    if (!brokers || brokers.length === 0) return [];

    const calculatedData: ComparisonData[] = brokers.map(broker => {
        const totalNewLeads = broker.dailyEntries.reduce((sum, entry) => sum + entry.newLeads, 0);
        const totalRepiqueLeads = broker.dailyEntries.reduce((sum, entry) => sum + (entry.repiqueLeads || 0), 0);
        const totalSales = broker.dailyEntries.reduce((sum, entry) => sum + entry.signedLeads, 0);
        const totalLeadsIn = totalNewLeads + totalRepiqueLeads;
        const conversionRate = totalLeadsIn > 0 ? (totalSales / totalLeadsIn) * 100 : 0;

        return {
            brokerName: broker.brokerName,
            totalNewLeads: totalLeadsIn,
            totalSales,
            conversionRate,
        };
    });

    // Sorting logic
    if (sortConfig !== null) {
        calculatedData.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });
    }

    return calculatedData;
  }, [brokers, sortConfig]);

  useEffect(() => {
    if (!comparisonChartRef.current || comparisonData.length === 0) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      return;
    };
    
    const ctx = comparisonChartRef.current.getContext('2d');
    if (!ctx) return;

    const labels = comparisonData.map(d => d.brokerName);
    const salesData = comparisonData.map(d => d.totalSales);
    const leadsData = comparisonData.map(d => d.totalNewLeads);

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Vendas',
            data: salesData,
            backgroundColor: 'rgba(37, 99, 235, 0.7)', // brand-primary
            borderColor: 'rgba(37, 99, 235, 1)',
            borderWidth: 1,
          },
          {
            label: 'Leads Recebidos',
            data: leadsData,
            backgroundColor: 'rgba(14, 165, 233, 0.7)', // brand-secondary
            borderColor: 'rgba(14, 165, 233, 1)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
                precision: 0
            }
          },
        },
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: false,
            },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [comparisonData]);

  const requestSort = (key: keyof ComparisonData) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof ComparisonData) => {
    if (!sortConfig || sortConfig.key !== key) {
        return <span className="opacity-40 ml-1">↑↓</span>;
    }
    return sortConfig.direction === 'ascending' ? '↑' : '↓';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (brokerName.trim() && typeof initialLeads === 'number' && initialLeads >= 0) {
      onAddBroker(brokerName, initialLeads, Number(monthlySalesGoal) || 0);
      setBrokerName('');
      setInitialLeads('');
      setMonthlySalesGoal('');
    }
  };
  
  const getRankColor = (index: number) => {
    if (index === 0) return 'text-amber-500'; // Gold
    if (index === 1) return 'text-slate-400'; // Silver
    if (index === 2) return 'text-orange-500'; // Bronze
    return 'text-text-secondary';
  };

  const handleEditClick = (broker: BrokerProfile) => {
    setEditingBroker(broker);
    setEditedName(broker.brokerName);
    setEditedInitialLeads(broker.initialLeads);
    setEditedMonthlySalesGoal(broker.monthlySalesGoal || '');
  };

  const handleCloseModal = () => {
    setEditingBroker(null);
  };

  const handleSaveChanges = () => {
    if (!editingBroker || !editedName.trim() || editedInitialLeads === '') return;
    const success = onUpdateBroker(editingBroker.brokerName, {
      brokerName: editedName.trim(),
      initialLeads: Number(editedInitialLeads),
      monthlySalesGoal: Number(editedMonthlySalesGoal) || 0,
    });
    if (success) {
      handleCloseModal();
    }
  };

  const handleDelete = () => {
    if (editingBroker) {
      onDeleteBroker(editingBroker.brokerName);
      handleCloseModal();
    }
  };
  
  const handleExportData = () => {
    if (brokers.length === 0) {
      alert("Não há dados para exportar.");
      return;
    }

    try {
      const dataStr = JSON.stringify(brokers, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.download = `backup_performance_leads_${date}.json`;
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Erro ao exportar dados:", error);
        alert("Ocorreu um erro inesperado ao tentar exportar os dados. Verifique o console do navegador para mais detalhes.");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);

        // Basic validation of the imported data structure
        const isValid = Array.isArray(data) && data.every(
          item => typeof item.brokerName === 'string' &&
                  typeof item.initialLeads === 'number' &&
                  Array.isArray(item.dailyEntries)
        );

        if (!isValid) {
          throw new Error("Formato de arquivo inválido.");
        }

        if (confirm("Atenção! A importação substituirá TODOS os dados existentes. Deseja continuar?")) {
          onRestoreBrokers(data);
        }
      } catch (error) {
        alert("Falha ao ler o arquivo de backup. Verifique se o arquivo está no formato JSON correto e não está corrompido.");
        console.error("Import error:", error);
      } finally {
        // Reset the file input value to allow re-uploading the same file
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };


  return (
    <div className="space-y-10 animate-fade-in">
      {deferredPrompt && (
        <section className="bg-surface-card rounded-2xl shadow-lg p-6 text-center border-2 border-brand-primary/50">
          <h2 className="text-xl font-semibold text-text-primary mb-2">Instale o App!</h2>
          <p className="text-text-secondary mb-4">Tenha acesso rápido ao Performance de Leads diretamente da sua área de trabalho.</p>
          <button
            onClick={onInstallClick}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold shadow-lg hover:opacity-90 transition-opacity duration-200"
          >
            Instalar Aplicativo
          </button>
        </section>
      )}

      <section className="bg-surface-card rounded-2xl shadow-2xl p-6 sm:p-10 transition-all duration-300 max-w-lg mx-auto">
        <h2 className="text-2xl font-semibold text-text-primary mb-2">Adicionar Novo Corretor</h2>
        <p className="text-text-secondary mb-6">Cadastre um novo corretor para começar a acompanhar.</p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="brokerName" className="block text-sm font-medium text-text-secondary mb-2">
              Nome do Corretor
            </label>
            <input
              type="text"
              id="brokerName"
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              placeholder="Ex: João da Silva"
              required
              className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all duration-200"
            />
          </div>
          <div>
            <label htmlFor="initialLeads" className="block text-sm font-medium text-text-secondary mb-2">
              Número de Clientes na Base Inicial
            </label>
            <input
              type="number"
              id="initialLeads"
              value={initialLeads}
              onChange={(e) => setInitialLeads(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              placeholder="Ex: 150"
              required
              min="0"
              className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all duration-200"
            />
          </div>
          <div>
            <label htmlFor="monthlySalesGoal" className="block text-sm font-medium text-text-secondary mb-2">
              Meta Mensal de Vendas (Opcional)
            </label>
            <input
              type="number"
              id="monthlySalesGoal"
              value={monthlySalesGoal}
              onChange={(e) => setMonthlySalesGoal(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              placeholder="Ex: 10"
              min="0"
              className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all duration-200"
            />
          </div>
          <button
            type="submit"
            className="w-full px-6 py-3 bg-gradient-to-r from-brand-primary to-brand-secondary text-white rounded-lg font-semibold shadow-lg hover:opacity-90 transition-opacity duration-200 disabled:opacity-50"
            disabled={!brokerName.trim() || initialLeads === ''}
          >
            Adicionar Corretor
          </button>
        </form>
      </section>

      <section className="bg-surface-card rounded-2xl shadow-xl p-6 sm:p-8 transition-all duration-300 max-w-lg mx-auto">
        <h2 className="text-2xl font-semibold text-text-primary mb-2">Backup e Restauração de Dados</h2>
        <p className="text-text-secondary mb-6">Exporte todos os dados para um arquivo de segurança ou importe um backup para restaurar suas informações.</p>
        <div className="flex flex-col sm:flex-row gap-4">
            <button
                onClick={handleExportData}
                className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold shadow-lg hover:bg-gray-700 transition-colors duration-200"
            >
                Exportar Backup (JSON)
            </button>
            <button
                onClick={handleImportClick}
                className="flex-1 px-6 py-3 bg-brand-primary text-white rounded-lg font-semibold shadow-lg hover:bg-brand-dark transition-colors duration-200"
            >
                Importar Backup (JSON)
            </button>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json,application/json"
                className="hidden"
            />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-text-primary mb-4 text-center">Ranking de Vendas (Geral)</h2>
        {rankedBrokers.length > 0 ? (
          <div className="max-w-2xl mx-auto bg-surface-card rounded-lg shadow-lg p-6">
            <ul className="space-y-4">
              {rankedBrokers.map((broker, index) => (
                <li key={broker.brokerName} className="flex items-center justify-between p-3 bg-surface-input rounded-md">
                  <div className="flex items-center gap-4">
                    <span className={`text-2xl font-bold w-8 text-center ${getRankColor(index)}`}>
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-text-primary">{broker.brokerName}</h3>
                      <p className="text-sm text-text-secondary">Base inicial: {broker.initialLeads} leads</p>
                    </div>
                  </div>
                  <div className="text-right">
                     <p className="text-xl font-bold text-brand-primary">{broker.totalSales}</p>
                     <p className="text-sm text-text-secondary">venda(s)</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-center text-text-secondary">Nenhum corretor com vendas para rankear ainda.</p>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-text-primary mb-4 text-center">Corretores Cadastrados</h2>
        {brokers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {brokers.map(broker => {
              const totalSales = broker.dailyEntries.reduce((sum, entry) => sum + entry.signedLeads, 0);
              const totalNewLeads = broker.dailyEntries.reduce((sum, entry) => sum + entry.newLeads, 0);
              const totalRepiqueLeads = broker.dailyEntries.reduce((sum, entry) => sum + (entry.repiqueLeads || 0), 0);
              const totalDiscarded = broker.dailyEntries.reduce((sum, entry) => sum + entry.discardedLeads, 0);
              const totalVisits = broker.dailyEntries.reduce((sum, entry) => sum + entry.localVisits, 0);
              
              const totalLeadsIn = totalNewLeads + totalRepiqueLeads;
              const conversionRate = totalLeadsIn > 0 ? ((totalSales / totalLeadsIn) * 100).toFixed(1) : "0.0";
              
              return(
                <div key={broker.brokerName} className="bg-surface-card rounded-xl shadow-lg p-5 flex flex-col justify-between transition-transform hover:scale-105 duration-300 border border-gray-100">
                  <div>
                    <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-3">
                      <div>
                          <h3 className="text-xl font-bold text-text-primary">{broker.brokerName}</h3>
                          <p className="text-xs text-text-secondary">Base inicial: <span className="font-semibold text-text-primary">{broker.initialLeads}</span></p>
                      </div>
                      <button onClick={() => handleEditClick(broker)} className="text-text-secondary hover:text-brand-primary transition-colors p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                          <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="flex justify-around text-center bg-brand-light/20 rounded-lg py-2 mb-4">
                      <div>
                        <p className="text-2xl font-bold text-brand-primary">{totalSales}</p>
                        <p className="text-xs text-brand-dark font-semibold uppercase">Vendas</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-text-primary">{conversionRate}<span className="text-sm">%</span></p>
                        <p className="text-xs text-text-secondary uppercase">Conversão</p>
                      </div>
                    </div>

                    <div className="bg-surface-input rounded-lg p-3 mb-4">
                         <h4 className="text-xs font-bold text-text-secondary uppercase mb-2 text-center border-b border-gray-200 pb-1">Resumo Geral</h4>
                         <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-center">
                            <div>
                                <p className="text-lg font-bold text-brand-secondary">{totalNewLeads}</p>
                                <p className="text-[10px] text-text-secondary uppercase">Novos Leads</p>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-blue-500">{totalRepiqueLeads}</p>
                                <p className="text-[10px] text-text-secondary uppercase">Repiques</p>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-purple-600">{totalVisits}</p>
                                <p className="text-[10px] text-text-secondary uppercase">Visitas</p>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-red-500">{totalDiscarded}</p>
                                <p className="text-[10px] text-text-secondary uppercase">Descartados</p>
                            </div>
                         </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectBroker(broker.brokerName)}
                    className="w-full mt-auto px-4 py-2 bg-brand-primary text-white rounded-lg font-semibold shadow-md hover:bg-brand-dark transition-colors duration-200"
                  >
                    Ver Painel Completo
                  </button>
                </div>
            )})}
          </div>
        ) : (
          <p className="text-center text-text-secondary py-8">Nenhum corretor cadastrado ainda. Adicione um para começar.</p>
        )}
      </section>
      
      <section>
        <h2 className="text-2xl font-semibold text-text-primary mb-4 text-center">Comparativo de Performance</h2>
        {comparisonData.length > 0 ? (
          <>
            <div className="bg-surface-card rounded-lg shadow-lg p-6 mb-6">
                <div className="relative h-96">
                    <canvas ref={comparisonChartRef}></canvas>
                </div>
            </div>
            <div className="overflow-x-auto bg-surface-card rounded-lg shadow-lg">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Corretor</th>
                            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => requestSort('totalNewLeads')}>Leads Recebidos {getSortIndicator('totalNewLeads')}</th>
                            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => requestSort('totalSales')}>Vendas {getSortIndicator('totalSales')}</th>
                            <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => requestSort('conversionRate')}>Taxa de Conversão {getSortIndicator('conversionRate')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {comparisonData.map(brokerData => (
                            <tr key={brokerData.brokerName} className="bg-white border-b hover:bg-gray-50">
                                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{brokerData.brokerName}</th>
                                <td className="px-6 py-4">{brokerData.totalNewLeads}</td>
                                <td className="px-6 py-4">{brokerData.totalSales}</td>
                                <td className="px-6 py-4">{brokerData.conversionRate.toFixed(2)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </>
        ) : (
          <p className="text-center text-text-secondary py-8">Dados insuficientes para gerar um comparativo.</p>
        )}
      </section>
      
      {editingBroker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-surface-card rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-lg">
            <h3 className="text-2xl font-bold text-text-primary mb-6">Editar Corretor</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="editBrokerName" className="block text-sm font-medium text-text-secondary mb-2">Nome do Corretor</label>
                <input type="text" id="editBrokerName" value={editedName} onChange={e => setEditedName(e.target.value)} className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none"/>
              </div>
              <div>
                <label htmlFor="editInitialLeads" className="block text-sm font-medium text-text-secondary mb-2">Base Inicial de Leads</label>
                <input type="number" id="editInitialLeads" value={editedInitialLeads} onChange={e => setEditedInitialLeads(e.target.value === '' ? '' : parseInt(e.target.value))} className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none"/>
              </div>
              <div>
                <label htmlFor="editMonthlySalesGoal" className="block text-sm font-medium text-text-secondary mb-2">Meta Mensal de Vendas</label>
                <input type="number" id="editMonthlySalesGoal" value={editedMonthlySalesGoal} onChange={e => setEditedMonthlySalesGoal(e.target.value === '' ? '' : parseInt(e.target.value))} className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none"/>
              </div>
            </div>
            <div className="mt-8 flex justify-between items-center gap-4">
              <button onClick={handleDelete} className="px-6 py-2 bg-red-600 text-white rounded-lg font-semibold shadow-lg hover:bg-red-700 transition-colors">Excluir</button>
              <div className="flex gap-4">
                <button onClick={handleCloseModal} className="px-6 py-2 bg-surface-input text-text-secondary rounded-lg font-semibold hover:bg-gray-200/80 transition-colors">Cancelar</button>
                <button onClick={handleSaveChanges} className="px-6 py-2 bg-brand-primary text-white rounded-lg font-semibold shadow-lg hover:bg-brand-dark transition-colors">Salvar Alterações</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BrokerManagement;
