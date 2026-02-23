import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import UploadReport from './pages/UploadReport'
import ChatPage from './pages/ChatPage'
import LogsPage from './pages/LogsPage'
import MedicinesPage from './pages/MedicinesPage'
import SummaryPage from './pages/SummaryPage'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="upload" element={<UploadReport />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="medicines" element={<MedicinesPage />} />
          <Route path="summary" element={<SummaryPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
