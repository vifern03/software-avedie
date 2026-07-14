import { useState } from 'react';
import { LayoutDashboard, Database, RefreshCw, UserPlus, Building2, History, LogOut, Settings, User, Store, ClipboardList, Sparkles, Menu, X, Landmark, Clock, Phone, Tag, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ALL_ITEMS = [
  { id: 'dashboard', label: 'Dashboard General',        icon: LayoutDashboard },
  { id: 'historica', label: 'Base de Datos Histórica',  icon: Database        },
  { id: 'radar',     label: 'Radar de Renovaciones',    icon: RefreshCw       },
  { id: 'b2c',       label: 'Alta B2C (Particular)',    icon: UserPlus        },
  { id: 'b2b',       label: 'Alta B2B (Empresa)',       icon: Building2       },
  { id: 'pendientes',    label: 'Gestión de Pendientes',   icon: AlertTriangle },
  { id: 'visitas',       label: 'Registro Visitas Tienda',  icon: Store      },
  { id: 'visitas_pymes', label: 'Registro Visitas PYMES',  icon: Landmark   },
  { id: 'llamadas',      label: 'Registro de Llamadas',    icon: Phone      },
  { id: 'tarifas',       label: 'Consulta de Tarifas',     icon: Tag        },
  { id: 'fichajes',      label: 'Control de Horario',      icon: Clock      },
  { id: 'reportes',      label: 'Reportes de Software',    icon: ClipboardList },
  { id: 'historial', label: 'Historial de Actividades', icon: History         },
  { id: 'gestion',   label: 'Gestión de Usuarios',      icon: Settings        },
];

const ROLE_LABEL = { admin: 'Administrador', manager: 'Manager', comercial: 'Comercial' };
const ROLE_DOT   = { admin: 'bg-google-blue', manager: 'bg-purple-500', comercial: 'bg-green-500' };

export default function Sidebar({ activeSection, onNavigate, onOpenAI }) {
  const { currentUser, hasAccess, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const visibleItems = ALL_ITEMS.filter(item => hasAccess(item.id));

  const handleNavigate = (id) => {
    onNavigate(id);
    setIsMobileMenuOpen(false);
  };

  const handleOpenAI = () => {
    onOpenAI();
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Cabecera móvil: hamburguesa + logo — solo visible en móvil */}
      <div className="fixed top-0 left-0 z-40 md:hidden flex items-center gap-3 px-4 pt-4">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="bg-white p-2 rounded-md shadow-md"
          aria-label="Abrir menú"
        >
          <Menu size={20} className="text-google-dark" />
        </button>
        <img
          src="https://multimedia-logos.infojobs.net/image/upload/w_155,h_155/9b/9b38ef65-853a-4c46-a58e-5e56bbceb467"
          alt="Grupo Avedie"
          className="h-9 w-9 rounded-lg object-cover shadow-md bg-white"
        />
      </div>

      {/* Fondo oscuro semitransparente — móvil, cierra el menú al pulsarlo */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Panel del Sidebar */}
      <aside className={[
        'fixed top-0 left-0 h-full z-50',
        'md:relative md:top-auto md:left-auto md:h-auto md:z-auto',
        'w-64 bg-white border-r border-google-border flex flex-col',
        'transition-transform duration-300 ease-in-out',
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}>

        {/* Logo + botón cierre */}
        <div className="px-6 py-5 border-b border-google-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://multimedia-logos.infojobs.net/image/upload/w_155,h_155/9b/9b38ef65-853a-4c46-a58e-5e56bbceb467"
              alt="Grupo Avedie"
              className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-google-dark leading-tight">Grupo Avedie</p>
              <p className="text-xs text-google-gray">Software de Gestión</p>
            </div>
          </div>
          {/* Botón X — solo visible en móvil */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1 rounded-md hover:bg-google-bg text-google-gray"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        {/* User badge */}
        {currentUser && (
          <div className="mx-3 mt-3 px-3 py-2.5 bg-google-bg rounded-lg flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${ROLE_DOT[currentUser.role]}`}>
              <User size={13} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-google-dark truncate">{currentUser.username}</p>
              <p className="text-xs text-google-gray">{ROLE_LABEL[currentUser.role]}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="px-3 mb-2 text-xs font-medium text-google-gray uppercase tracking-wider">
            Menú principal
          </p>

          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                className={`
                  sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium
                  ${isActive
                    ? 'bg-google-blue-light text-google-blue'
                    : 'text-google-gray hover:bg-google-bg hover:text-google-dark'
                  }
                `}
              >
                <Icon size={18} className={isActive ? 'text-google-blue' : ''} />
                <span className="flex-1 leading-tight">{item.label}</span>
              </button>
            );
          })}

          {/* Asistente IA — visible para todos los roles, sin filtro de permisos */}
          <button
            onClick={handleOpenAI}
            className="sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-google-gray hover:bg-google-bg hover:text-google-dark"
          >
            <Sparkles size={18} />
            <span className="flex-1 leading-tight">Asistente Personal</span>
            <span className="text-[10px] font-bold bg-google-blue text-white rounded-full px-1.5 py-0.5 leading-none">
              IA
            </span>
          </button>
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-google-border space-y-2">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-150"
          >
            <LogOut size={16} />
            <span>Cerrar Sesión</span>
          </button>
          <p className="text-xs text-google-gray text-center px-2">Grupo Avedie · v1.0</p>
        </div>
      </aside>
    </>
  );
}
