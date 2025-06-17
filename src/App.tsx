import React, { useState } from 'react';
import { LoadingOverlay } from './components/LoadingOverlay';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [latestActivity, setLatestActivity] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async (decodedText: string) => {
    if (isScanning) return;
    
    setIsScanning(true);
    setIsLoading(true);
    
    try {
      // ...existing scan logic...
      
      // Update latest activity when user data is loaded
      if (userData) {
        const activityText = userData.name ? 
          `Gebruiker: ${userData.name}` : 
          'Gebruikersgegevens geladen';
        setLatestActivity(activityText);
      }
      
      // ...existing code...
    } catch (error) {
      // ...existing error handling...
    } finally {
      setIsLoading(false);
      setIsScanning(false);
    }
  };

  return (
    <div className="App">
      {/* ...existing code... */}
      
      <div className="scanner-container" style={{ position: 'relative' }}>
        {/* ...existing camera/scanner code... */}
        
        <LoadingOverlay 
          isVisible={isLoading}
          latestActivity={latestActivity}
        />
      </div>
      
      {/* ...existing code... */}
    </div>
  );
}

export default App;