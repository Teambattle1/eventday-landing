import Landing from './Landing'
import AdminPanel from './AdminPanel'

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin')
  return isAdmin ? <AdminPanel /> : <Landing />
}
