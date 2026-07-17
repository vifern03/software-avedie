import { useState, useEffect } from 'react';
import { ShieldOff, Database, Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { useData } from './context/DataContext';
import Sidebar from './components/Sidebar';
import AIAssistant from './components/AIAssistant';
import PymesQueueBanner from './components/PymesQueueBanner';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import AltaClientes from './pages/AltaClientes';
import HistoricaDB from './pages/HistoricaDB';
import RadarRenovaciones from './pages/RadarRenovaciones';
import HistorialActividades from './pages/HistorialActividades';
import GestionUsuarios from './pages/GestionUsuarios';
import RegistroVisitas from './pages/RegistroVisitas';
import RegistroVisitasPymes from './pages/RegistroVisitasPymes';
import ReportesSoftware from './pages/ReportesSoftware';
import ControlHorario from './pages/ControlHorario';
import RegistroLlamadas from './pages/RegistroLlamadas';
import Tarifas from './pages/Tarifas';
import Pendientes from './pages/Pendientes';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-google-bg flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-google overflow-hidden">
        <img
          src="https://multimedia-logos.infojobs.net/image/upload/w_155,h_155/9b/9b38ef65-853a-4c46-a58e-5e56bbceb467"
          alt="Grupo Avedie"
          className="w-12 h-12 object-contain"
        />
      </div>
      <Loader2 size={28} className="text-google-blue animate-spin" />
      <p className="text-sm text-google-gray">Conectando con la base de datos…</p>
    </div>
  );
}

function DBErrorScreen({ error }) {
  return (
    <div className="min-h-screen bg-google-bg flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-lg p-8 text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <Database size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-google-dark">Base de datos no inicializada</h2>
        <p className="text-sm text-google-gray whitespace-pre-line">{error}</p>
        <div className="bg-gray-50 rounded-xl p-4 text-left">
          <p className="text-xs font-semibold text-google-dark mb-2">Instrucciones:</p>
          <ol className="text-xs text-google-gray space-y-1 list-decimal list-inside">
            <li>Abre el <strong>Editor SQL</strong> de tu proyecto Supabase</li>
            <li>Copia y ejecuta el contenido de <code className="bg-gray-200 px-1 rounded">supabase_init.sql</code></li>
            <li>Recarga esta página</li>
          </ol>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary text-sm px-6 py-2"
        >
          Recargar página
        </button>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <ShieldOff size={28} className="text-red-500" />
      </div>
      <h2 className="text-xl font-semibold text-google-dark">Acceso denegado</h2>
      <p className="text-google-gray mt-2 max-w-xs">
        No tienes permiso para ver esta sección.<br />
        Contacte con el administrador <strong>Adolfo</strong>.
      </p>
    </div>
  );
}

export default function App() {
  const { currentUser, hasAccess, isLoading: authLoading, dbError } = useAuth();
  const { isLoading: dataLoading } = useData();
  const [activeSection, setActiveSection] = useState('b2c');
  const [isAIOpen, setIsAIOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const SECTIONS = ['dashboard', 'historica', 'radar', 'b2c', 'b2b', 'historial', 'visitas', 'visitas_pymes', 'llamadas', 'tarifas', 'fichajes', 'reportes', 'pendientes', 'gestion'];
    const first = SECTIONS.find(s => hasAccess(s));
    if (first) setActiveSection(first);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading) return <LoadingScreen />;
  if (dbError)     return <DBErrorScreen error={dbError} />;
  if (!currentUser) return <LoginPage />;
  if (dataLoading)  return <LoadingScreen />;

  const handleNavigate = (section) => setActiveSection(section);

  const renderPage = () => {
    if (!hasAccess(activeSection)) return <AccessDenied />;
    switch (activeSection) {
      case 'dashboard': return <Dashboard onNavigate={handleNavigate} />;
      case 'historica': return <HistoricaDB />;
      case 'radar':     return <RadarRenovaciones />;
      case 'b2c':       return <AltaClientes tipo="B2C" />;
      case 'b2b':       return <AltaClientes tipo="B2B" />;
      case 'historial': return <HistorialActividades />;
      case 'visitas':       return <RegistroVisitas />;
      case 'visitas_pymes': return <RegistroVisitasPymes />;
      case 'llamadas':  return <RegistroLlamadas />;
      case 'tarifas':   return <Tarifas />;
      case 'fichajes':  return <ControlHorario />;
      case 'reportes':  return <ReportesSoftware />;
      case 'pendientes': return <Pendientes />;
      case 'gestion':   return <GestionUsuarios />;
      default:          return <AltaClientes tipo="B2C" />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-google-bg">
      <Sidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenAI={() => setIsAIOpen(true)}
      />
      <main className="flex-1 overflow-y-auto bg-white pt-14 md:pt-0">
        {renderPage()}
      </main>
      <AIAssistant isOpen={isAIOpen} onOpenChange={setIsAIOpen} />
      <PymesQueueBanner />
    </div>
  );
}
