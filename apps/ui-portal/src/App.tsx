import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ServicesPage } from './routes/ServicesPage';
import { ServiceDetailPage } from './routes/ServiceDetailPage';
import { VersionDetailPage } from './routes/VersionDetailPage';
import { DiffPage } from './routes/DiffPage';
import { HubClientProvider } from './context/HubClientContext';

export function App() {
  return (
    <HubClientProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<ServicesPage />} />
            <Route path="/services/:service" element={<ServiceDetailPage />} />
            <Route path="/services/:service/versions/:version" element={<VersionDetailPage />} />
            <Route path="/services/:service/diff" element={<DiffPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </HubClientProvider>
  );
}
