import { Route, Routes } from 'react-router-dom';
import { Guest } from './pages/Guest';
import { Host } from './pages/Host';
import { Screen } from './pages/Screen';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Guest />} />
      <Route path="/host" element={<Host />} />
      <Route path="/screen" element={<Screen />} />
      <Route path="*" element={<Guest />} />
    </Routes>
  );
}
