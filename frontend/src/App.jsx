import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Register from './pages/Register'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AddHealthRecords from './pages/AddHealthRecords'
import XRayReport from './pages/XRayReport'
import MedicinesPage from './pages/MedicinesPage'
import LogsPage from './pages/LogsPage'
import WearablesPage from './pages/WearablesPage'
import NutritionPage from './pages/NutritionPage'
import HealthInsights from './pages/HealthInsights'
import AskHealthRecord from './pages/AskHealthRecord'
import ECGReport from './pages/ECGReport'

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
          <Route path="add-records" element={<AddHealthRecords />} />
          <Route path="xray" element={<XRayReport />} />
          <Route path="ecg" element={<ECGReport />} />
          <Route path="medicines" element={<MedicinesPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="wearables" element={<WearablesPage />} />
          <Route path="nutrition" element={<NutritionPage />} />
          <Route path="insights" element={<HealthInsights />} />
          <Route path="ask" element={<AskHealthRecord />} />

          {/* Legacy route compatibility fallbacks */}
          <Route path="upload" element={<Navigate to="/add-records" replace />} />
          <Route path="summary" element={<Navigate to="/insights" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
