import { LayoutDashboard, Database, RefreshCw, UserPlus, Building2, History, LogOut, Settings, User, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ALL_ITEMS = [
  { id: 'dashboard', label: 'Dashboard General',        icon: LayoutDashboard },
  { id: 'historica', label: 'Base de Datos Histórica',  icon: Database        },
  { id: 'radar',     label: 'Radar de Renovaciones',    icon: RefreshCw       },
  { id: 'b2c',       label: 'Alta B2C (Particular)',    icon: UserPlus        },
  { id: 'b2b',       label: 'Alta B2B (Empresa)',       icon: Building2       },
  { id: 'visitas',   label: 'Registro Visitas Tienda',  icon: Store           },
  { id: 'historial', label: 'Historial de Actividades', icon: History         },
  { id: 'gestion',   label: 'Gestión de Usuarios',      icon: Settings        },
];

const ROLE_LABEL = { admin: 'Administrador', manager: 'Manager', comercial: 'Comercial' };
const ROLE_DOT   = { admin: 'bg-google-blue', manager: 'bg-purple-500', comercial: 'bg-green-500' };

export default function Sidebar({ activeSection, onNavigate }) {
  const { currentUser, hasAccess, logout } = useAuth();

  const visibleItems = ALL_ITEMS.filter(item => hasAccess(item.id));

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-google-border flex flex-col">

      {/* Logo */}
      <div className="px-6 py-5 border-b border-google-border">
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
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 mb-2 text-xs font-medium text-google-gray uppercase tracking-wider">
          Menú principal
        </p>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
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
  );
}
