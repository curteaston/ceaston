import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Applications from './pages/Applications'

export default function App() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-indigo-700 text-white' : 'text-indigo-100 hover:bg-indigo-600'}`

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-800 px-6 py-3 flex items-center gap-4">
        <span className="text-white font-bold text-lg mr-6">JobBot</span>
        <NavLink to="/" end className={linkClass}>Dashboard</NavLink>
        <NavLink to="/profile" className={linkClass}>Profile</NavLink>
        <NavLink to="/applications" className={linkClass}>Applications</NavLink>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/applications" element={<Applications />} />
        </Routes>
      </main>
    </div>
  )
}
