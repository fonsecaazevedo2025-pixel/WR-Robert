import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { BrokerProfile, DailyEntry } from '../types';

// TypeScript declarations for global libraries loaded via CDN
declare const html2canvas: any;
declare const jspdf: any;
declare const Chart: any;

// Helper to get local date string YYYY-MM-DD
const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const NumberInput: React.FC<{
  id: keyof Omit<DailyEntry, 'date' | 'discardReason'>;
  label: string;
  value: number | ''; // Allow empty string for bulk edit
  onChange: (field: keyof Omit<DailyEntry, 'date' | 'discardReason'>, value: number | '') => void;
  placeholder: string;
  error?: boolean;
}> = ({ id, label, value, onChange, placeholder, error }) => (
  <div>
    <label htmlFor={id as string} className="block text-sm font-medium text-text-secondary mb-2">{label}</label>
    <input
      type="number"
      id={id as string}
      value={value === 0 ? '' : value} // Display 0 as empty string
      onChange={(e) => {
        const val = e.target.value;
        onChange(id, val === '' ? '' : parseInt(val, 10));
      }}
      placeholder={placeholder}
      min="0"
      className={`w-full px-4 py-3 bg-surface-input border rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 outline-none transition-all duration-200 ${
        error 
        ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
        : 'border-gray-200 focus:ring-brand-primary focus:border-brand-primary'
      }`}
      aria-invalid={error ? "true" : "false"}
    />
    {error && <p className="mt-1 text-xs text-red-600" role="alert">Por favor, insira um número inteiro não negativo.</p>}
  </div>
);


const MetricCard: React.FC<{ label: string; value: string | number; }> = ({ label, value }) => (
    <div className="bg-surface-card p-4 rounded-lg shadow-lg text-center">
        <p className="text-text-secondary text-sm capitalize">{label}</p>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
    </div>
);

const GoalProgressCard: React.FC<{ current: number; goal: number }> = ({ current, goal }) => {
    if (!goal || goal <= 0) {
        return (
            <div className="bg-surface-card rounded-2xl shadow-xl p-6 text-center no-print">
                <p className="text-text-secondary text-lg">Nenhuma meta de vendas definida para este mês.</p>
                <p className="text-sm text-text-placeholder mt-1">Você pode definir uma na tela de gerenciamento de corretores.</p>
            </div>
        );
    }
    const progress = Math.round((current / goal) * 100);
    return (
        <div className="bg-surface-card rounded-2xl shadow-xl p-6 no-print">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-text-primary">Progresso da Meta Mensal</h3>
                <span className="text-lg font-bold text-brand-primary">{`${progress}%`}</span>
            </div>
            <div className="w-full bg-surface-input rounded-full h-4 relative overflow-hidden">
                <div 
                    className="bg-gradient-to-r from-brand-secondary to-brand-primary h-4 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    role="progressbar"
                >
                </div>
            </div>
            <p className="text-right text-text-secondary text-sm mt-1 font-semibold">{`${current} de ${goal} vendas`}</p>
        </div>
    );
};


interface BrokerDashboardProps { // Renamed interface
  profile: BrokerProfile;
  onSaveEntry: (entry: DailyEntry) => void;
  onDeleteEntry: (date: string) => void;
  onReset: () => void;
}

const BrokerDashboard: React.FC<BrokerDashboardProps> = ({ profile, onSaveEntry, onDeleteEntry, onReset }) => { // Renamed component
  const initialState: Omit<DailyEntry, 'date'> = {
    newLeads: 0, discardedLeads: 0, repiqueLeads: 0, localVisits: 0, contactingLeads: 0, inProgressLeads: 0,
    scheduledLeads: 0, negotiationLeads: 0, creditAnalysisLeads: 0, approvedLeads: 0, signedLeads: 0,
    discardReason: '', // Initialize discardReason
  };
  const [dailyData, setDailyData] = useState(initialState);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof initialState, boolean>>>({});
  const [dateToDelete, setDateToDelete] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);

  // State for bulk edit
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState(getTodayString());
  const [bulkEndDate, setBulkEndDate] = useState(getTodayString());
  // FIX: Allow 'number | '' in bulkDailyData properties to correctly handle empty input fields.
  const [bulkDailyData, setBulkDailyData] = useState<Partial<Record<keyof Omit<DailyEntry, 'date' | 'discardReason'>, number | ''>>>({});
  const [bulkErrors, setBulkErrors] = useState<Partial<Record<keyof typeof initialState, boolean>>>({});

  const monthlyChartRef = useRef<HTMLCanvasElement>(null);
  const monthlyChartInstanceRef = useRef<any>(null);


  // --- AUTO-SAVE / DRAFT LOGIC ---
  const getDraftKey = (date: string) => `draft_entry_${profile.brokerName}_${date}`;

  // Load data: Check Draft -> Check Saved Entry -> Default
  useEffect(() => {
    const draftKey = getDraftKey(selectedDate);
    const savedDraft = localStorage.getItem(draftKey);
    const existingEntry = profile.dailyEntries.find(e => e.date === selectedDate);
    
    setErrors({}); // Clear errors when date changes

    if (savedDraft) {
        // Priority 1: Unsaved Draft (Restore user work)
        try {
            const parsedDraft = JSON.parse(savedDraft);
            setDailyData(parsedDraft);
            setIsDraft(true);
        } catch (e) {
            console.error("Error parsing draft", e);
            // Fallback if draft is corrupt
            if (existingEntry) {
                 const { date, ...formData } = existingEntry;
                 setDailyData({ ...initialState, ...formData });
                 setIsDraft(false);
            } else {
                setDailyData(initialState);
                setIsDraft(false);
            }
        }
    } else if (existingEntry) {
      // Priority 2: Saved Database Entry
      const { date, ...formData } = existingEntry;
      setDailyData({ ...initialState, ...formData });
      setIsDraft(false);
    } else {
      // Priority 3: Clean Slate
      setDailyData(initialState);
      setIsDraft(false);
    }
  }, [selectedDate, profile.dailyEntries, profile.brokerName]);

  // Save Draft on Change
  useEffect(() => {
      if (!dailyData) return;
      
      // Simple check to see if data is empty (all zeros), we might not want to save "empty" drafts 
      // effectively, but for safety, we save everything.
      
      const draftKey = getDraftKey(selectedDate);
      // We only save to draft if it differs from the "Saved" state, but simplifying:
      // Always save current form state to draft.
      localStorage.setItem(draftKey, JSON.stringify(dailyData));
      setIsDraft(true);

  }, [dailyData, selectedDate, profile.brokerName]);

  // --- END AUTO-SAVE LOGIC ---


  const handleNumberChange = (field: keyof Omit<DailyEntry, 'date' | 'discardReason'>, value: number | '') => {
    // Validation: check for negative numbers. Floats are handled by parseInt in the input.
    if (value !== '' && value < 0) {
      setErrors(prev => ({ ...prev, [field]: true }));
    } else {
      setErrors(prev => ({ ...prev, [field]: false }));
    }
    // Store the sanitized value (ensure it's not negative)
    setDailyData(prev => ({ ...prev, [field]: value === '' ? 0 : Math.max(0, value) }));
  };

  const handleBulkNumberChange = (field: keyof Omit<DailyEntry, 'date' | 'discardReason'>, value: number | '') => {
    if (value !== '' && value < 0) {
      setBulkErrors(prev => ({ ...prev, [field]: true }));
    } else {
      setBulkErrors(prev => ({ ...prev, [field]: false }));
    }
    setBulkDailyData(prev => ({ ...prev, [field]: value }));
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate) {
        alert('Por favor, selecione uma data válida para o lançamento.');
        return;
    }

    const today = getTodayString();
    if (selectedDate > today) {
        alert('A data do lançamento não pode ser posterior à data atual (futura).');
        return;
    }

    // Check for any active errors before submitting
    const hasActiveErrors = Object.values(errors).some(isError => isError);
    if (hasActiveErrors) {
        alert('Por favor, corrija os campos com erros antes de salvar.');
        return;
    }

    // Clean discardReason if no discarded leads
    const finalData = { ...dailyData };
    if (finalData.discardedLeads === 0) {
        finalData.discardReason = '';
    }

    const entryWithDate: DailyEntry = { ...finalData, date: selectedDate };
    onSaveEntry(entryWithDate);
    
    // Clear the draft since we successfully saved
    localStorage.removeItem(getDraftKey(selectedDate));
    setIsDraft(false);

    alert('Lançamento salvo com sucesso!');
  };

  const labelsMap: { [key in keyof Omit<DailyEntry, 'date' | 'discardReason'>]: string } = {
    newLeads: "Novos Leads", discardedLeads: "Descartados", repiqueLeads: "Repique", localVisits: "Visitas Locais", contactingLeads: "Tentando Contato",
    inProgressLeads: "Em Andamento", scheduledLeads: "Agendados", negotiationLeads: "Leads em Negociação",
    creditAnalysisLeads: "Análise de Crédito", approvedLeads: "Aprovados", signedLeads: "Contrato Assinado"
  };

  const fieldOrder: (keyof Omit<DailyEntry, 'date' | 'discardReason'>)[] = [
    'newLeads', 'discardedLeads', 'repiqueLeads', 'localVisits', 'contactingLeads', 'inProgressLeads', 
    'scheduledLeads', 'negotiationLeads', 'creditAnalysisLeads', 'approvedLeads', 'signedLeads'
  ];

  const entriesWithCalculatedBalances = useMemo(() => {
    const chronologicalEntries = [...profile.dailyEntries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let currentLeadBase = profile.initialLeads;
    const entriesWithBalance = chronologicalEntries.map(entry => {
      const startOfDayBalance = currentLeadBase; // Store the balance at the start of the day
      const endOfDayBalance = currentLeadBase + entry.newLeads + (entry.repiqueLeads || 0) - entry.discardedLeads - entry.signedLeads;
      const result = { ...entry, startOfDayBalance, endOfDayBalance };
      currentLeadBase = endOfDayBalance;
      return result;
    });
    return entriesWithBalance.reverse(); // reverse for on-screen display (most recent first)
  }, [profile.dailyEntries, profile.initialLeads]);

  const allTimeStats = useMemo(() => {
    const totalNew = profile.dailyEntries.reduce((acc, entry) => acc + entry.newLeads, 0);
    const totalRepique = profile.dailyEntries.reduce((acc, entry) => acc + (entry.repiqueLeads || 0), 0);
    const totalDiscarded = profile.dailyEntries.reduce((acc, entry) => acc + entry.discardedLeads, 0);
    
    return {
      totalReceived: totalNew + totalRepique,
      totalDiscarded: totalDiscarded
    };
  }, [profile.dailyEntries]);

  const handleGenerateCsv = () => {
    if (!profile || profile.dailyEntries.length === 0) {
      alert("Nenhum lançamento para exportar.");
      return;
    }

    // Sort entries chronologically for the CSV file
    const chronologicalEntries = [...entriesWithCalculatedBalances].reverse();

    // Check if any entry has a discard reason to determine if we need the column
    const hasDiscardReasons = chronologicalEntries.some(entry => entry.discardReason && entry.discardReason.trim() !== '');

    // Define CSV headers
    const headers = [
      'Data',
      'Base Inicial do Dia',
      ...fieldOrder.map(key => labelsMap[key]),
      ...(hasDiscardReasons ? ['Motivo do Descarte'] : []), // Conditionally add header
      'Saldo Final do Dia'
    ];

    // Create CSV rows
    const rows = chronologicalEntries.map(entry => {
      const rowData = [
        new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-BR'),
        entry.startOfDayBalance,
        ...fieldOrder.map(key => entry[key as keyof DailyEntry] ?? 0),
        ...(hasDiscardReasons ? [entry.discardReason || ''] : []), // Conditionally add value
        entry.endOfDayBalance
      ];
      return rowData.map(val => typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val).join(','); // Escape quotes
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows
    ].join('\n');

    // Create a Blob and trigger download
    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' }); // Added BOM for Excel
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `Historico-Completo-${profile.brokerName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    const { jsPDF } = jspdf;
    const printableElement = document.querySelector('.printable-area') as HTMLElement;

    if (!printableElement) {
      console.error("Área para impressão não encontrada!");
      setIsGeneratingPdf(false);
      return;
    }

    document.body.classList.add('pdf-export-mode');

    try {
      const canvas = await html2canvas(printableElement, {
        scale: 2, // Maior escala para melhor qualidade
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const ratio = canvasWidth / pdfWidth;
      const imgHeight = canvasHeight / ratio;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const monthName = new Date(selectedMonth + '-02').toLocaleDateString('pt-BR', { month: 'long' });
      const year = new Date(selectedMonth + '-02').getFullYear();
      pdf.save(`Relatorio-${profile.brokerName.replace(/\s+/g, '_')}-${monthName}-${year}.pdf`);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Ocorreu um erro ao gerar o PDF. Tente novamente.");
    } finally {
      document.body.classList.remove('pdf-export-mode');
      setIsGeneratingPdf(false);
    }
  };
  
  const monthlySummary = useMemo(() => {
    const chronologicalEntries = [...profile.dailyEntries].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate initial leads for the selected month by cumulating previous entries
    let currentLeadBaseForMonth = profile.initialLeads;
    for (const entry of chronologicalEntries) {
        if (entry.date < `${selectedMonth}-01`) {
            currentLeadBaseForMonth = currentLeadBaseForMonth + entry.newLeads + (entry.repiqueLeads || 0) - entry.discardedLeads - entry.signedLeads;
        } else {
            break; // Stop when we reach entries for the selected month
        }
    }

    const monthEntries = chronologicalEntries.filter(entry => entry.date.startsWith(selectedMonth));
    const newLeads = monthEntries.reduce((sum, entry) => sum + entry.newLeads, 0);
    const repiqueLeads = monthEntries.reduce((sum, entry) => sum + (entry.repiqueLeads || 0), 0);
    const signedLeads = monthEntries.reduce((sum, entry) => sum + entry.signedLeads, 0);
    const discardedLeads = monthEntries.reduce((sum, entry) => sum + entry.discardedLeads, 0);
    const negotiationLeads = monthEntries.reduce((sum, entry) => sum + entry.negotiationLeads, 0);
    const totalLeadsIn = newLeads + repiqueLeads;
    const conversionRate = totalLeadsIn > 0 ? ((signedLeads / totalLeadsIn) * 100).toFixed(1) : "0.0";
    const finalLeadsForMonth = currentLeadBaseForMonth + totalLeadsIn - discardedLeads - signedLeads; // Corrected calculation

    return { 
      newLeads, repiqueLeads, signedLeads, discardedLeads, conversionRate, negotiationLeads,
      initialLeadsForMonth: currentLeadBaseForMonth, 
      finalLeadsForMonth 
    };
  }, [profile.dailyEntries, selectedMonth, profile.initialLeads]);

  
  const reportEntries = useMemo(() => {
    return entriesWithCalculatedBalances
        .filter(entry => entry.date.startsWith(selectedMonth))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // sort chronologically for the table
  }, [entriesWithCalculatedBalances, selectedMonth]);

  // Check if any entry in the current report has a discard reason to show the column in PDF
  const showDiscardReasonInReport = useMemo(() => {
    return reportEntries.some(entry => entry.discardReason && entry.discardReason.trim() !== '');
  }, [reportEntries]);


  useEffect(() => {
    if (!monthlyChartRef.current) {
        return;
    }
    
    if (reportEntries.length === 0) {
        if (monthlyChartInstanceRef.current) {
            monthlyChartInstanceRef.current.destroy();
            monthlyChartInstanceRef.current = null;
        }
        return;
    };
    
    const ctx = monthlyChartRef.current.getContext('2d');
    if (!ctx) return;

    const labels = reportEntries.map(e => new Date(e.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    const balanceData = reportEntries.map(e => e.endOfDayBalance);
    const newLeadsData = reportEntries.map(e => e.newLeads);
    const salesData = reportEntries.map(e => e.signedLeads);
    const negotiationData = reportEntries.map(e => e.negotiationLeads);

    if (monthlyChartInstanceRef.current) {
      monthlyChartInstanceRef.current.destroy();
    }

    monthlyChartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Saldo de Leads',
            data: balanceData,
            borderColor: 'rgba(37, 99, 235, 1)', // brand-primary
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Novos Leads',
            data: newLeadsData,
            borderColor: 'rgba(14, 165, 233, 1)', // brand-secondary
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            tension: 0.3,
          },
          {
            label: 'Em Negociação',
            data: negotiationData,
            borderColor: 'rgba(249, 115, 22, 1)',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            tension: 0.3,
          },
          {
            label: 'Vendas',
            data: salesData,
            borderColor: 'rgba(22, 163, 74, 1)',
            backgroundColor: 'rgba(22, 163, 74, 0.1)',
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
          },
        },
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: false
            },
        },
        interaction: {
            intersect: false,
            mode: 'index',
        },
      },
    });

    return () => {
      if (monthlyChartInstanceRef.current) {
        monthlyChartInstanceRef.current.destroy();
      }
    };
  }, [reportEntries, selectedMonth]);


  const handleEditClick = (entry: DailyEntry) => {
    setSelectedDate(entry.date);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const confirmDelete = () => {
    if (dateToDelete) {
      onDeleteEntry(dateToDelete);
      localStorage.removeItem(getDraftKey(dateToDelete)); // Also clear draft if deleting
      setDateToDelete(null);
    }
  };

  const handleBulkSave = (e: React.FormEvent) => {
    e.preventDefault();

    const today = getTodayString();

    if (!bulkStartDate) {
      alert("Por favor, selecione a Data Inicial.");
      return;
    }

    if (!bulkEndDate) {
      alert("Por favor, selecione a Data Final.");
      return;
    }

    if (bulkStartDate > today) {
        alert("A Data Inicial não pode ser futura.");
        return;
    }
    if (bulkEndDate > today) {
        alert("A Data Final não pode ser futura.");
        return;
    }

    if (bulkStartDate > bulkEndDate) {
      alert("A Data Inicial não pode ser posterior à Data Final.");
      return;
    }

    const hasActiveBulkErrors = Object.values(bulkErrors).some(isError => isError);
    if (hasActiveBulkErrors) {
        alert('Por favor, corrija os campos com erros antes de salvar.');
        return;
    }

    let currentDate = new Date(bulkStartDate + 'T00:00:00');
    const endDate = new Date(bulkEndDate + 'T00:00:00');

    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];
      const existingEntry = profile.dailyEntries.find(e => e.date === dateString);

      const updatedEntry: DailyEntry = {
        date: dateString,
        newLeads: typeof bulkDailyData.newLeads === 'number' ? bulkDailyData.newLeads : (existingEntry?.newLeads ?? 0),
        discardedLeads: typeof bulkDailyData.discardedLeads === 'number' ? bulkDailyData.discardedLeads : (existingEntry?.discardedLeads ?? 0),
        repiqueLeads: typeof bulkDailyData.repiqueLeads === 'number' ? bulkDailyData.repiqueLeads : (existingEntry?.repiqueLeads ?? 0),
        localVisits: typeof bulkDailyData.localVisits === 'number' ? bulkDailyData.localVisits : (existingEntry?.localVisits ?? 0),
        contactingLeads: typeof bulkDailyData.contactingLeads === 'number' ? bulkDailyData.contactingLeads : (existingEntry?.contactingLeads ?? 0),
        inProgressLeads: typeof bulkDailyData.inProgressLeads === 'number' ? bulkDailyData.inProgressLeads : (existingEntry?.inProgressLeads ?? 0),
        scheduledLeads: typeof bulkDailyData.scheduledLeads === 'number' ? bulkDailyData.scheduledLeads : (existingEntry?.scheduledLeads ?? 0),
        negotiationLeads: typeof bulkDailyData.negotiationLeads === 'number' ? bulkDailyData.negotiationLeads : (existingEntry?.negotiationLeads ?? 0),
        creditAnalysisLeads: typeof bulkDailyData.creditAnalysisLeads === 'number' ? bulkDailyData.creditAnalysisLeads : (existingEntry?.creditAnalysisLeads ?? 0),
        approvedLeads: typeof bulkDailyData.approvedLeads === 'number' ? bulkDailyData.approvedLeads : (existingEntry?.approvedLeads ?? 0),
        signedLeads: typeof bulkDailyData.signedLeads === 'number' ? bulkDailyData.signedLeads : (existingEntry?.signedLeads ?? 0),
        discardReason: existingEntry?.discardReason || '', // Preserve existing reason during bulk number edit
      };
      
      onSaveEntry(updatedEntry);
      localStorage.removeItem(getDraftKey(dateString)); // Clear drafts for bulk edited dates

      currentDate.setDate(currentDate.getDate() + 1);
    }

    alert('Edição em massa salva com sucesso!');
    setShowBulkEditModal(false);
    setBulkDailyData({}); // Reset bulk data
    setBulkErrors({}); // Reset bulk errors
  };

  return (
    <div className="animate-fade-in">
        <div className="space-y-8">
          {/* --- Controls Section (Not for printing) --- */}
          <section className="bg-surface-card rounded-2xl shadow-xl p-6 sm:p-8 no-print">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                    <h2 className="text-2xl font-semibold text-text-primary">Relatório Mensal</h2>
                    <p className="text-text-secondary">Selecione o mês e gere o relatório de performance.</p>
                </div>
                <div className="mt-4 sm:mt-0 flex flex-wrap gap-2 items-center">
                    <label htmlFor="monthSelector" className="sr-only">Selecionar Mês</label>
                    <input 
                        type="month" id="monthSelector" value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-4 py-2 bg-surface-input border border-gray-200 rounded-lg text-text-primary focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none"
                    />
                    <button 
                      onClick={handleGeneratePdf} 
                      disabled={isGeneratingPdf}
                      className="px-4 py-2 bg-brand-primary text-white rounded-lg font-semibold shadow-lg hover:bg-brand-dark transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Gerar Relatório em PDF"
                    >
                      {isGeneratingPdf ? 'Gerando...' : 'Gerar PDF Mensal'}
                    </button>
                    <button 
                      onClick={handleGenerateCsv} 
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold shadow-lg hover:bg-emerald-700 transition-colors duration-200"
                      aria-label="Exportar todo o histórico em CSV"
                    >
                      Exportar CSV (Completo)
                    </button>
                    <button 
                      onClick={() => setShowBulkEditModal(true)} 
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold shadow-lg hover:bg-gray-700 transition-colors duration-200"
                      aria-label="Abrir modal de edição em massa"
                    >
                      Edição em Massa
                    </button>
                </div>
            </div>
          </section>

          <section className="bg-surface-card rounded-2xl shadow-xl p-6 no-print">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Resumo Geral Acumulado</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div>
                        <p className="text-sm text-text-secondary font-medium">Total Recebidos (Novos + Repiques)</p>
                        <p className="text-3xl font-bold text-brand-primary mt-1">{allTimeStats.totalReceived}</p>
                    </div>
                    <div className="p-3 bg-white rounded-full text-brand-primary shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
                     <div>
                        <p className="text-sm text-text-secondary font-medium">Total de Leads Descartados</p>
                        <p className="text-3xl font-bold text-red-600 mt-1">{allTimeStats.totalDiscarded}</p>
                    </div>
                    <div className="p-3 bg-white rounded-full text-red-600 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </div>
                </div>
            </div>
          </section>

          <div className="printable-area">
             {/* --- NEW, PROFESSIONAL PRINT-ONLY REPORT --- */}
            <div className="print-only p-8 bg-white text-black">
                {/* Report Header */}
                <div className="flex justify-between items-center border-b-2 border-gray-300 pb-4 mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Relatório de Performance Mensal</h1>
                        <p className="text-lg text-gray-600">Corretor: {profile.brokerName}</p>
                    </div>
                    <div className="text-right">
                        <p className="font-semibold text-gray-700">Mês de Referência:</p>
                        <p className="text-gray-600">{new Date(selectedMonth + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                    </div>
                </div>

                {/* Summary Metrics */}
                <section className="mb-8">
                    <h2 className="text-2xl font-bold text-gray-700 mb-4">Resumo do Mês</h2>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Base Inicial</p><p className="text-2xl font-bold text-gray-800">{monthlySummary.initialLeadsForMonth}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Base Final</p><p className="text-2xl font-bold text-gray-800">{monthlySummary.finalLeadsForMonth}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Leads Recebidos</p><p className="text-2xl font-bold text-gray-800">{monthlySummary.newLeads}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Repiques</p><p className="text-2xl font-bold text-blue-500">{monthlySummary.repiqueLeads}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Leads Descartados</p><p className="text-2xl font-bold text-red-600">{monthlySummary.discardedLeads}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Vendas Realizadas</p><p className="text-2xl font-bold text-green-600">{monthlySummary.signedLeads}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Meta de Vendas</p><p className="text-2xl font-bold text-gray-800">{profile.monthlySalesGoal || 'N/A'}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Progresso da Meta</p><p className="text-2xl font-bold text-blue-600">{profile.monthlySalesGoal ? `${Math.round((monthlySummary.signedLeads / profile.monthlySalesGoal) * 100)}%` : 'N/A'}</p></div>
                        <div className="border border-gray-200 p-4 rounded-lg text-center"><p className="text-gray-500 text-sm">Taxa de Conversão</p><p className="text-2xl font-bold text-blue-600">{monthlySummary.conversionRate}%</p></div>
                    </div>
                </section>

                {/* Detailed Daily Log Table */}
                <section>
                    <h2 className="text-2xl font-bold text-gray-700 mb-4">Lançamentos Diários</h2>
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                            <tr>
                                <th scope="col" className="px-4 py-3">Data</th>
                                <th scope="col" className="px-4 py-3 text-center">Base Inicial do Dia</th>
                                <th scope="col" className="px-4 py-3 text-center">Novos Leads</th>
                                <th scope="col" className="px-4 py-3 text-center">Contratos Assinados</th>
                                <th scope="col" className="px-4 py-3 text-center">Leads Descartados</th>
                                {showDiscardReasonInReport && <th scope="col" className="px-4 py-3 text-center">Motivo do Descarte</th>}
                                <th scope="col" className="px-4 py-3 text-center">Saldo Final do Dia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportEntries.map(entry => (
                                <tr key={entry.date} className="bg-white border-b">
                                    <th scope="row" className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                                        {new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </th>
                                    <td className="px-4 py-3 text-center">{entry.startOfDayBalance}</td>
                                    <td className="px-4 py-3 text-center">{entry.newLeads}</td>
                                    <td className="px-4 py-3 text-center text-green-600 font-semibold">{entry.signedLeads}</td>
                                    <td className="px-4 py-3 text-center text-red-600 font-semibold">{entry.discardedLeads}</td>
                                    {showDiscardReasonInReport && <td className="px-4 py-3 text-center text-gray-600 italic text-xs">{entry.discardReason || '-'}</td>}
                                    <td className="px-4 py-3 text-center font-bold text-gray-800">{entry.endOfDayBalance}</td>
                                </tr>
                            ))}
                            {reportEntries.length === 0 && (
                                <tr><td colSpan={showDiscardReasonInReport ? 7 : 6} className="text-center py-4">Nenhum lançamento neste mês.</td></tr>
                            )}
                        </tbody>
                    </table>
                </section>

                {/* Report Footer */}
                <div className="mt-8 pt-4 text-center text-xs text-gray-400 border-t">
                    Relatório gerado em {new Date().toLocaleString('pt-BR')} | Performance de Leads
                </div>
            </div>
          </div>
          
          <GoalProgressCard current={monthlySummary.signedLeads} goal={profile.monthlySalesGoal || 0} />

          <section className="bg-surface-card rounded-2xl shadow-xl p-6 sm:p-8 no-print">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricCard label="Base Inicial (Mês)" value={monthlySummary.initialLeadsForMonth} />
                <MetricCard label="Base Final (Mês)" value={monthlySummary.finalLeadsForMonth} />
                <MetricCard label="Leads Recebidos (Mês)" value={monthlySummary.newLeads} />
                <MetricCard label="Repiques (Mês)" value={monthlySummary.repiqueLeads} />
                <MetricCard label="Em Negociação (Mês)" value={monthlySummary.negotiationLeads} />
                <MetricCard label="Vendas (Mês)" value={monthlySummary.signedLeads} />
                <MetricCard label="Leads Descartados (Mês)" value={monthlySummary.discardedLeads} />
                <MetricCard label="Meta de Vendas" value={profile.monthlySalesGoal || 'N/A'} />
                <MetricCard label="Conversão (Mês)" value={`${monthlySummary.conversionRate}%`} />
            </div>
          </section>

          <section className="bg-surface-card rounded-2xl shadow-xl p-6 sm:p-8 no-print">
            <h2 className="text-2xl font-semibold text-text-primary mb-4">Evolução Mensal</h2>
            <div className="relative h-96">
                {reportEntries.length > 0 ? (
                    <canvas ref={monthlyChartRef}></canvas>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-text-secondary">Nenhum lançamento no mês selecionado para exibir o gráfico.</p>
                    </div>
                )}
            </div>
          </section>

          <section className="no-print">
            <h2 className="text-2xl font-semibold text-text-primary mb-4">Histórico de Lançamentos</h2>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2 bg-surface-main/80 p-4 rounded-lg">
                {entriesWithCalculatedBalances.length > 0 ? entriesWithCalculatedBalances.map(entry => {
                    const dailyLeadsIn = entry.newLeads + (entry.repiqueLeads || 0);
                    const dailyUtilization = dailyLeadsIn > 0 ? `${((entry.signedLeads / dailyLeadsIn) * 100).toFixed(1)}%` : 'N/A';
                    return (
                    <div key={entry.date} className="bg-surface-card p-4 rounded-lg shadow-md">
                        <h3 className="font-bold text-lg text-brand-primary">{new Date(entry.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2 text-sm list-disc list-inside">
                            <li className="col-span-full sm:col-span-1"><span className="font-semibold text-text-secondary">Base Inicial do Dia:</span> {entry.startOfDayBalance}</li>
                            {Object.entries(entry).filter(([key, value]) => key !== 'date' && key !== 'discardReason' && key !== 'endOfDayBalance' && key !== 'startOfDayBalance' && typeof value === 'number' && value > 0).map(([key, value]) => (
                                <li key={key}><span className="font-semibold text-text-secondary">{labelsMap[key as keyof Omit<DailyEntry, 'date' | 'discardReason'>]}:</span> {value as number}</li>
                            ))}
                        </ul>
                        {entry.discardReason && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded text-sm text-red-700">
                                <span className="font-semibold">Motivo do Descarte:</span> {entry.discardReason}
                            </div>
                        )}
                          <div className="mt-3 pt-3 border-t border-gray-200/80 flex flex-wrap justify-between items-center gap-4">
                            <div className="flex flex-col">
                              <p className="text-md font-semibold text-text-primary">Leads restantes p/ dia seguinte: <span className="text-brand-primary text-lg">{entry.endOfDayBalance}</span></p>
                              <p className="text-md font-semibold text-text-primary">Aproveitamento do Dia: <span className="text-brand-secondary text-lg">{dailyUtilization}</span></p>
                            </div>
                            <div className="flex gap-2 no-print">
                                <button 
                                  onClick={() => handleEditClick(entry)} 
                                  className="flex items-center gap-1 px-3 py-1 text-sm bg-brand-light/50 text-brand-dark rounded-md hover:bg-brand-light transition border border-brand-light/50"
                                  title="Editar lançamento"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  Editar
                                </button>
                                <button 
                                  onClick={() => setDateToDelete(entry.date)} 
                                  className="flex items-center gap-1 px-3 py-1 text-sm bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition border border-red-200"
                                  title="Excluir lançamento"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Excluir
                                </button>
                            </div>
                        </div>
                    </div>
                )}) : (
                    <div className="text-center py-8 bg-surface-card rounded-lg"><p className="text-text-secondary">Nenhum lançamento encontrado.</p></div>
                )}
            </div>
          </section>

          <section ref={formRef} className="bg-surface-card rounded-2xl shadow-xl p-6 sm:p-8 no-print">
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-2xl font-semibold text-text-primary">Lançamento do Dia</h2>
                {isDraft && (
                    <div className="flex items-center gap-2 text-sm text-brand-secondary bg-brand-light/30 px-3 py-1 rounded-full animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span>Rascunho salvo automaticamente</span>
                    </div>
                )}
            </div>
            <p className="text-text-secondary mb-6">Selecione uma data para adicionar ou editar as atividades.</p>
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                 <label htmlFor="entryDate" className="block text-sm font-medium text-text-secondary mb-2">Data</label>
                 <input type="date" id="entryDate" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                    max={getTodayString()}
                    className="px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all duration-200"/>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {fieldOrder.map(key => {
                  const keyTyped = key as keyof Omit<DailyEntry, 'date' | 'discardReason'>;
                  return <NumberInput 
                    key={keyTyped} 
                    id={keyTyped} 
                    label={labelsMap[keyTyped]} 
                    value={dailyData[keyTyped]} 
                    onChange={handleNumberChange} 
                    placeholder="0"
                    error={errors[keyTyped]}
                    />
                })}
                {dailyData.discardedLeads > 0 && (
                    <div className="col-span-full animate-fade-in">
                         <label htmlFor="discardReason" className="block text-sm font-medium text-text-secondary mb-2">Motivo do Descarte</label>
                         <textarea
                            id="discardReason"
                            value={dailyData.discardReason || ''}
                            onChange={(e) => setDailyData({ ...dailyData, discardReason: e.target.value })}
                            placeholder="Descreva o motivo do descarte..."
                            className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all duration-200 min-h-[100px]"
                         />
                    </div>
                )}
              </div>
              <button type="submit" className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-brand-primary to-brand-secondary text-white rounded-lg font-semibold shadow-lg hover:opacity-90 transition-opacity duration-200">
                Salvar Lançamento
              </button>
            </form>
          </section>
          
          <div className="mt-10 text-center no-print">
            <button onClick={onReset} className="inline-flex items-center gap-2 px-8 py-3 bg-brand-secondary/80 text-white rounded-lg font-semibold shadow-lg hover:bg-brand-secondary transition-colors duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              Trocar de Corretor
            </button>
          </div>
      </div>
      {dateToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
          <div className="bg-surface-card rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md" role="document">
            <h3 className="text-2xl font-bold text-text-primary mb-4">Confirmar Exclusão</h3>
            <p className="text-text-secondary mb-6">
              Tem certeza que deseja excluir o lançamento do dia{' '}
              <strong>{new Date(dateToDelete + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>?
              <br/>
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setDateToDelete(null)}
                className="px-6 py-2 bg-surface-input text-text-secondary rounded-lg font-semibold hover:bg-gray-200/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-6 py-2 bg-red-600 text-white rounded-lg font-semibold shadow-lg hover:bg-red-700 transition-colors"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkEditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
          <div className="bg-surface-card rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto" role="document">
            <h3 className="text-2xl font-bold text-text-primary mb-4">Edição em Massa de Lançamentos</h3>
            <p className="text-text-secondary mb-6">Selecione o período e os campos para aplicar valores a múltiplos dias. Campos vazios não serão alterados em lançamentos existentes ou usarão 0 para novos lançamentos.</p>
            <form onSubmit={handleBulkSave}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label htmlFor="bulkStartDate" className="block text-sm font-medium text-text-secondary mb-2">Data Inicial</label>
                  <input type="date" id="bulkStartDate" value={bulkStartDate} onChange={(e) => setBulkStartDate(e.target.value)}
                    max={getTodayString()}
                    className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all duration-200"/>
                </div>
                <div>
                  <label htmlFor="bulkEndDate" className="block text-sm font-medium text-text-secondary mb-2">Data Final</label>
                  <input type="date" id="bulkEndDate" value={bulkEndDate} onChange={(e) => setBulkEndDate(e.target.value)}
                    max={getTodayString()}
                    className="w-full px-4 py-3 bg-surface-input border border-gray-200 rounded-lg text-text-primary placeholder-text-placeholder focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all duration-200"/>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {fieldOrder.map(key => {
                  const keyTyped = key as keyof Omit<DailyEntry, 'date' | 'discardReason'>;
                  return <NumberInput 
                    key={`bulk-${keyTyped}`} 
                    id={keyTyped} 
                    label={labelsMap[keyTyped]} 
                    value={bulkDailyData[keyTyped] ?? ''} 
                    onChange={handleBulkNumberChange} 
                    placeholder="Manter existente / 0"
                    error={bulkErrors[keyTyped]}
                    />
                })}
              </div>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkEditModal(false);
                    setBulkDailyData({}); // Clear form data on cancel
                    setBulkErrors({}); // Clear errors on cancel
                  }}
                  className="px-6 py-2 bg-surface-input text-text-secondary rounded-lg font-semibold hover:bg-gray-200/80 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-gradient-to-r from-brand-primary to-brand-secondary text-white rounded-lg font-semibold shadow-lg hover:opacity-90 transition-opacity"
                >
                  Salvar Edição em Massa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrokerDashboard;