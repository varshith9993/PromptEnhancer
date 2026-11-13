import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EnhancerPage } from './pages/EnhancerPage';
import { HomePage } from './pages/HomePage';
import { InstallPage } from './pages/InstallPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/enhance" element={<EnhancerPage />} />
          <Route path="/install" element={<InstallPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

