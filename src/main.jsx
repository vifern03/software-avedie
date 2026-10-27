import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { DataProvider } from './context/DataContext.jsx'
import { TasksProvider } from './context/TasksContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <TasksProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </TasksProvider>
    </AuthProvider>
  </StrictMode>,
)
