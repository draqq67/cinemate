import { StrictMode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import MoviePage from './pages/MoviePage';
import HomePage from './pages/HomePage';
import BrowsePage from './pages/BrowsePage';
import WatchlistPage from './pages/WatchlistPage';
import AdminPage from './pages/AdminPage';
import PersonPage from './pages/PersonPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ListsPage from './pages/ListsPage';
import ListDetailPage from './pages/ListDetailPage';
import ActivityPage from './pages/ActivityPage';
import WatchPartyPage from './pages/WatchPartyPage';
import ImportPage from './pages/ImportPage';
import DiscoverPage from './pages/DiscoverPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/"              element={<HomePage />} />
          <Route path="/browse"        element={<BrowsePage />} />
          <Route path="/movie/:tmdbId" element={<MoviePage />} />
          <Route path="/person/:personId" element={<PersonPage />} />
          <Route path="/lists"         element={<ListsPage />} />
          <Route path="/lists/:id"     element={<ListDetailPage />} />
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/register"      element={<RegisterPage />} />
          <Route path="/profile"       element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/watchlist"     element={<ProtectedRoute><WatchlistPage /></ProtectedRoute>} />
          <Route path="/activity"      element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
          <Route path="/analytics"     element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/party/:code"   element={<ProtectedRoute><WatchPartyPage /></ProtectedRoute>} />
          <Route path="/admin"         element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/import"        element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
          <Route path="/discover"      element={<DiscoverPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
