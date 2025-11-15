import React, { useState, useEffect } from 'react';
import type { BrokerProfile, DailyEntry } from './types';
import BrokerManagement from './components/BrokerManagement';
import BrokerDashboard from './components/BrokerDashboard'; // Renamed from Step2InitialLeads

// Function to safely load brokers from localStorage on initial load.
const getInitialBrokers = (): BrokerProfile[] => {
  try {
    const savedBrokers = localStorage.getItem('lead-performance-brokers');
    if (savedBrokers) {
      const parsedBrokers = JSON.parse(savedBrokers);
      // Ensure the loaded data is an array to prevent runtime errors
      if (Array.isArray(parsedBrokers)) {
        return parsedBrokers;
      }
    }
  } catch (error) {
    console.error("Failed to load or parse brokers from localStorage", error);
    // If data is corrupted, start with a clean slate to prevent app crash.
  }
  return []; // Default to an empty array if nothing is saved or data is corrupt.
};


const App: React.FC = () => {
  // Use the lazy initializer for useState to read from localStorage only on the initial render.
  const [brokers, setBrokers] = useState<BrokerProfile[]>(getInitialBrokers);
  const [selectedBroker, setSelectedBroker] = useState<BrokerProfile | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any | null>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = () => {
      if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult: { outcome: string }) => {
              if (choiceResult.outcome === 'accepted') {
                  console.log('User accepted the install prompt');
              } else {
                  console.log('User dismissed the install prompt');
              }
              setDeferredPrompt(null);
          });
      }
  };


  // Save brokers to localStorage whenever the list changes.
  useEffect(() => {
    try {
      localStorage.setItem('lead-performance-brokers', JSON.stringify(brokers));
    } catch (error) {
      console.error("Failed to save brokers to localStorage", error);
    }
  }, [brokers]);

  const handleAddBroker = (brokerName: string, initialLeads: number, monthlySalesGoal: number) => {
    if (brokers.some(b => b.brokerName.toLowerCase() === brokerName.toLowerCase())) {
      alert('Já existe um corretor com este nome.');
      return;
    }
    const newBroker: BrokerProfile = {
      brokerName,
      initialLeads,
      monthlySalesGoal,
      dailyEntries: [],
    };
    setBrokers(prev => [...prev, newBroker]);
  };
  
  const handleUpdateBroker = (originalName: string, updatedData: { brokerName: string; initialLeads: number; monthlySalesGoal: number }): boolean => {
    // Check for name duplication only if the name has changed.
    if (originalName.toLowerCase() !== updatedData.brokerName.toLowerCase()) {
      if (brokers.some(b => b.brokerName.toLowerCase() === updatedData.brokerName.toLowerCase())) {
        alert('Já existe um corretor com este nome.');
        return false; // Indicate failure
      }
    }

    setBrokers(prevBrokers => {
      const newBrokers = prevBrokers.map(broker => {
        if (broker.brokerName === originalName) {
          // Preserve daily entries, only update name and initial leads
          return { ...broker, ...updatedData };
        }
        return broker;
      });
      // Also update the selectedBroker state if it's the one being edited
      if (selectedBroker && selectedBroker.brokerName === originalName) {
          const updatedSelected = newBrokers.find(b => b.brokerName === updatedData.brokerName);
          if (updatedSelected) {
              setSelectedBroker(updatedSelected);
          }
      }
      return newBrokers;
    });
    return true; // Indicate success
  };

  const handleDeleteBroker = (brokerNameToDelete: string) => {
    if (!confirm(`Tem certeza que deseja excluir o corretor "${brokerNameToDelete}"? Todos os seus lançamentos serão perdidos permanentemente.`)) {
      return;
    }
    setBrokers(prevBrokers => prevBrokers.filter(broker => broker.brokerName !== brokerNameToDelete));
    // If the deleted broker was selected, go back to the management screen
    if (selectedBroker && selectedBroker.brokerName === brokerNameToDelete) {
      setSelectedBroker(null);
    }
  };

  const handleSelectBroker = (brokerName: string) => {
    const broker = brokers.find(b => b.brokerName === brokerName);
    if (broker) {
      setSelectedBroker(broker);
    }
  };

  const handleSwitchBroker = () => {
    setSelectedBroker(null);
  };

  const handleSaveEntry = (entry: DailyEntry) => {
    if (!selectedBroker) return;

    setBrokers(prevBrokers => {
      return prevBrokers.map(broker => {
        if (broker.brokerName === selectedBroker.brokerName) {
          const existingIndex = broker.dailyEntries.findIndex(e => e.date === entry.date);
          let updatedEntries;

          if (existingIndex > -1) {
            updatedEntries = [...broker.dailyEntries];
            updatedEntries[existingIndex] = entry;
          } else {
            updatedEntries = [...broker.dailyEntries, entry];
          }
          const updatedBroker = { ...broker, dailyEntries: updatedEntries };
          // Also update the selectedBroker state to reflect changes immediately
          setSelectedBroker(updatedBroker);
          return updatedBroker;
        }
        return broker;
      });
    });
  };
  
  const handleDeleteEntry = (date: string) => {
    if (!selectedBroker) return;

    setBrokers(prevBrokers => {
      return prevBrokers.map(broker => {
        if (broker.brokerName === selectedBroker.brokerName) {
          const updatedEntries = broker.dailyEntries.filter(e => e.date !== date);
          const updatedBroker = { ...broker, dailyEntries: updatedEntries };
          setSelectedBroker(updatedBroker); // Update live view
          return updatedBroker;
        }
        return broker;
      });
    });
  };
  
  const handleRestoreBrokers = (restoredBrokers: BrokerProfile[]) => {
    // Basic validation to ensure we're setting an array
    if (Array.isArray(restoredBrokers)) {
        setBrokers(restoredBrokers);
        alert('Dados restaurados com sucesso!');
    } else {
        alert('O arquivo de backup parece estar corrompido. A restauração falhou.');
    }
  };


  return (
    <div className="min-h-screen bg-surface-main text-text-primary flex flex-col items-center py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="w-full max-w-5xl mx-auto">
        <header className="text-center mb-8 no-print">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary">
            Performance de Leads
          </h1>
          <p className="text-text-secondary mt-2 text-lg">
            {selectedBroker ? `Diário de Bordo de ${selectedBroker.brokerName}` : 'Gerenciamento de Performance de Corretores'}
          </p>
        </header>

        <main>
          {!selectedBroker ? (
            <BrokerManagement 
              brokers={brokers} 
              onAddBroker={handleAddBroker} 
              onSelectBroker={handleSelectBroker} 
              onUpdateBroker={handleUpdateBroker}
              onDeleteBroker={handleDeleteBroker}
              onRestoreBrokers={handleRestoreBrokers}
              deferredPrompt={deferredPrompt}
              onInstallClick={handleInstallClick}
            />
          ) : (
            <BrokerDashboard // Renamed from Dashboard (Step2InitialLeads)
              profile={selectedBroker} 
              onSaveEntry={handleSaveEntry} 
              onDeleteEntry={handleDeleteEntry}
              onReset={handleSwitchBroker} 
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
