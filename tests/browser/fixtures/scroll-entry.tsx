import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useScrollHidden } from '../../../components/use-scroll-hidden';

function Fixture() {
  const [pinned, setPinned] = useState(false);
  const [route, setRoute] = useState('overview');
  const hidden = useScrollHidden(route, pinned);
  return <div style={{ height: 3000 }}>
    <nav aria-label="Mobile tabs" data-hidden={hidden} style={{ position: 'fixed', bottom: 20, height: 80, width: '100%', transition: 'transform 300ms', transform: hidden ? 'translateY(148px)' : 'translateY(0)' }}>
      <button onClick={() => setPinned(!pinned)}>More</button>
      <button onClick={() => setRoute('bookings')}>Bookings</button>
    </nav>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
