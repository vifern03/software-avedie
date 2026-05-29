import { useState, useEffect } from 'react';
import { ShieldOff } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import AltaClientes from './pages/AltaClientes';
import HistoricaDB from './pages/HistoricaDB';
import RadarRenovaciones from './pages/RadarRenovaciones';
import HistorialActividades from './pages/HistorialActividades';
import GestionUsuarios from './pages/GestionUsuarios';
import RegistroVisitas from './pages/RegistroVisitas';
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
  const { currentUser, hasAccess } = useAuth();
  const [activeSection, setActiveSection] = useState('b2c');

  useEffect(() => {
    if (!currentUser) return;
    const SECTIONS = ['dashboard', 'historica', 'radar', 'b2c', 'b2b', 'historial', 'visitas', 'gestion'];
    const first = SECTIONS.find(s => hasAccess(s));
    if (first) setActiveSection(first);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentUser) return <LoginPage />;

  const handleNavigate = (section) => {
    setActiveSection(section);
  };

  const renderPage = () => {
    if (!hasAccess(activeSection)) return <AccessDenied />;

    switch (activeSection) {
      case 'dashboard': return <Dashboard onNavigate={handleNavigate} />;
      case 'historica': return <HistoricaDB />;
      case 'radar':     return <RadarRenovaciones />;
      case 'b2c':       return <AltaClientes tipo="B2C" />;
      case 'b2b':       return <AltaClientes tipo="B2B" />;
      case 'historial': return <HistorialActividades />;
      case 'visitas':   return <RegistroVisitas />;
      case 'gestion':   return <GestionUsuarios />;
      default:          return <AltaClientes tipo="B2C" />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-google-bg">
      <Sidebar activeSection={activeSection} onNavigate={handleNavigate} />
      <main className="flex-1 overflow-y-auto bg-white">
        {renderPage()}
      </main>
    </div>
  );
}
